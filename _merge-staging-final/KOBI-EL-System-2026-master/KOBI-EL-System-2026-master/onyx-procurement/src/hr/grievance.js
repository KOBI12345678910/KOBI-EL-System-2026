/**
 * Employee Grievance & Complaint System — Zero-Dependency, Israeli-Law Compliant
 * Agent Y-075 • Techno-Kol Uzi • Swarm 7 • Kobi's mega-ERP
 *
 * מערכת תלונות ופניות עובדים — ללא תלויות חיצוניות, תואמת דין ישראלי
 *
 * A full end-to-end pipeline for filing, investigating, deciding and
 * appealing employee grievances (harassment, discrimination, safety,
 * pay, management, hr-policy, retaliation, ethics, other).
 *
 * Rule of the house (Kobi's law):
 *   "לא מוחקים רק משדרגים ומגדלים"
 *   — Nothing is ever deleted. Every state change is appended to a
 *     tamper-evident audit trail.
 *
 * -------------------------------------------------------------
 * ISRAELI STATUTES COVERED
 * -------------------------------------------------------------
 *  • חוק למניעת הטרדה מינית, התשנ"ח-1998
 *      Dedicated officer (אחראי/ת למניעת הטרדה מינית),
 *      statutory investigation within 7 days, retaliation ban.
 *  • תקנות למניעת הטרדה מינית (חובות מעביד), התשנ"ח-1998
 *      Written complaint procedure, protected record-keeping,
 *      summary reporting on request of the Ministry of Labor.
 *  • חוק הגנה על עובדים (חשיפת עבירות ופגיעה בטוהר המידות או
 *    במינהל התקין), התשנ"ז-1997 — whistleblower (חושף שחיתויות)
 *      Protection from dismissal / adverse action for complainant.
 *  • חוק שכר שווה לעובדת ולעובד, התשנ"ו-1996
 *      Equal-pay complaint handling.
 *  • חוק שוויון הזדמנויות בעבודה, התשמ"ח-1988
 *      Discrimination complaints.
 *  • חוק הגנת הפרטיות, התשמ"א-1981
 *      Strict RBAC, encryption at rest, need-to-know access.
 *  • חוק ארגון הפיקוח על העבודה, התשי"ד-1954 — safety complaints.
 *
 * -------------------------------------------------------------
 * ENCRYPTION
 * -------------------------------------------------------------
 * AES-256-GCM via `node:crypto` — the only "dependency" is Node's
 * built-in crypto module (no npm packages). Key derivation: scryptSync
 * with a per-complaint 32-byte salt. The GCM IV (12 bytes) and auth
 * tag (16 bytes) are stored next to the ciphertext.
 *
 * Encrypted envelope (hex-encoded fields, JSON-serialisable):
 *     { v:1, alg:'aes-256-gcm', salt, iv, tag, ct }
 *
 * -------------------------------------------------------------
 * ACCESS CONTROL (RBAC)
 * -------------------------------------------------------------
 * Four built-in roles, extendable by caller:
 *   • 'hr-officer'           — file, view, investigate, decide
 *   • 'harassment-officer'   — אחראי/ת למניעת הטרדה מינית
 *                              (exclusive rights on harassment cases)
 *   • 'legal'                — read + appeal review
 *   • 'ceo'                  — appeal approver, statutory reporting
 *   • 'complainant'          — may view ONLY their own case
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   new GrievanceSystem({ encryptionKey, clock, randomId, auditLog })
 *
 *   .fileComplaint({ complainant, anonymous, category, description,
 *                    evidence, witnesses, severity })
 *   .assignInvestigator(complaintId, investigator)
 *   .recordInterview({ complaintId, subject, content, consent })
 *   .scheduleHearings(complaintId)
 *   .decideVerdict({ complaintId, finding, actions, appeal })
 *   .retaliationMonitor(complaintId, daysAfter)
 *   .encrypt(complaint)            static helper
 *   .decrypt(envelope)             static helper
 *   .restrictAccess({ complaintId, allowedRoles })
 *   .checkAccess(complaintId, actor)
 *   .statutoryReport(period)
 *   .appealProcess(complaintId)
 *   .getComplaint(complaintId, actor)   — RBAC-gated reader
 *
 * -------------------------------------------------------------
 * ZERO DEPS
 * -------------------------------------------------------------
 * Only `node:crypto` — standard library. No npm dependencies.
 *
 * Bilingual labels: Hebrew + English, every user-facing string.
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Valid complaint categories. */
const CATEGORIES = Object.freeze({
  harassment:  { he: 'הטרדה מינית / הטרדה',        en: 'Harassment' },
  discrimination: { he: 'אפליה',                      en: 'Discrimination' },
  safety:      { he: 'בטיחות בעבודה',                en: 'Workplace safety' },
  pay:         { he: 'שכר / שכר שווה',               en: 'Pay / Equal pay' },
  management:  { he: 'התנהלות ניהולית',              en: 'Management conduct' },
  'hr-policy': { he: 'מדיניות משאבי אנוש',            en: 'HR policy' },
  retaliation: { he: 'נקמנות / התנכלות',              en: 'Retaliation' },
  ethics:      { he: 'אתיקה / חשיפת שחיתות',         en: 'Ethics / Whistleblowing' },
  other:       { he: 'אחר',                          en: 'Other' },
});

/** Severity levels — drive SLA and escalation path. */
const SEVERITY = Object.freeze({
  low:      { he: 'נמוכה',  en: 'Low',      slaDays: 30 },
  medium:   { he: 'בינונית', en: 'Medium',   slaDays: 14 },
  high:     { he: 'גבוהה',   en: 'High',     slaDays: 7 },
  critical: { he: 'קריטית',  en: 'Critical', slaDays: 2 },
});

/** Lifecycle states of a complaint — append-only, never deleted. */
const STATUS = Object.freeze({
  FILED:          'filed',
  INVESTIGATING:  'investigating',
  HEARING:        'hearing',
  DECIDED:        'decided',
  APPEALED:       'appealed',
  MONITORING:     'monitoring', // retaliation watch period
  CLOSED:         'closed',     // end of SLA + monitoring window
});

/** Statutory routing — which category triggers which Israeli statute. */
const STATUTORY_ROUTE = Object.freeze({
  harassment: {
    statute: {
      he: 'חוק למניעת הטרדה מינית, התשנ"ח-1998',
      en: 'Sexual Harassment Prevention Law, 5758-1998',
    },
    requiresOfficer: 'harassment-officer',
    investigationDays: 7,
    retaliationProtection: true,
    ministryNotifiable: true,
  },
  discrimination: {
    statute: {
      he: 'חוק שוויון הזדמנויות בעבודה, התשמ"ח-1988',
      en: 'Equal Employment Opportunities Law, 5748-1988',
    },
    requiresOfficer: 'hr-officer',
    investigationDays: 14,
    retaliationProtection: true,
    ministryNotifiable: true,
  },
  pay: {
    statute: {
      he: 'חוק שכר שווה לעובדת ולעובד, התשנ"ו-1996',
      en: 'Equal Pay Law, 5756-1996',
    },
    requiresOfficer: 'hr-officer',
    investigationDays: 21,
    retaliationProtection: true,
    ministryNotifiable: false,
  },
  ethics: {
    statute: {
      he: 'חוק הגנה על עובדים (חשיפת עבירות), התשנ"ז-1997',
      en: 'Protection of Employees (Exposure of Offences) Law, 5757-1997',
    },
    requiresOfficer: 'legal',
    investigationDays: 14,
    retaliationProtection: true,
    ministryNotifiable: true,
  },
  retaliation: {
    statute: {
      he: 'חוק הגנה על עובדים (חשיפת עבירות), התשנ"ז-1997',
      en: 'Protection of Employees (Exposure of Offences) Law, 5757-1997',
    },
    requiresOfficer: 'legal',
    investigationDays: 7,
    retaliationProtection: true,
    ministryNotifiable: true,
  },
  safety: {
    statute: {
      he: 'פקודת הבטיחות בעבודה, התש"ל-1970',
      en: 'Safety at Work Ordinance, 5730-1970',
    },
    requiresOfficer: 'hr-officer',
    investigationDays: 14,
    retaliationProtection: true,
    ministryNotifiable: true,
  },
  management:  { requiresOfficer: 'hr-officer', investigationDays: 21, retaliationProtection: true, ministryNotifiable: false },
  'hr-policy': { requiresOfficer: 'hr-officer', investigationDays: 21, retaliationProtection: false, ministryNotifiable: false },
  other:       { requiresOfficer: 'hr-officer', investigationDays: 30, retaliationProtection: false, ministryNotifiable: false },
});

/** Default RBAC matrix per role. */
const DEFAULT_ROLES = Object.freeze({
  'hr-officer':         { view: true,  edit: true,  decide: true,  appeal: false, statutory: true  },
  'harassment-officer': { view: true,  edit: true,  decide: true,  appeal: false, statutory: true  },
  'legal':              { view: true,  edit: false, decide: false, appeal: true,  statutory: true  },
  'ceo':                { view: true,  edit: false, decide: false, appeal: true,  statutory: true  },
  'complainant':        { view: 'own', edit: false, decide: false, appeal: true,  statutory: false },
});

/** Bilingual label bundle used in reports and emitted events. */
const LABELS = Object.freeze({
  FILED:          { he: 'תלונה הוגשה',           en: 'Complaint filed' },
  ANONYMOUS:      { he: 'אנונימי',                en: 'Anonymous' },
  INVESTIGATING:  { he: 'בבדיקה',                 en: 'Under investigation' },
  HEARING:        { he: 'בשימוע',                 en: 'Hearing' },
  DECIDED:        { he: 'הוחלט',                  en: 'Decided' },
  APPEALED:       { he: 'ערעור',                  en: 'Appeal in progress' },
  MONITORING:     { he: 'ניטור נקמנות',           en: 'Retaliation monitoring' },
  CLOSED:         { he: 'נסגר',                   en: 'Closed' },
  PROTECTED:      { he: 'מוגן מפני נקמנות',       en: 'Protected from retaliation' },
  STATUTORY:      { he: 'תלונה סטטוטורית',        en: 'Statutory complaint' },
});

// ═══════════════════════════════════════════════════════════════
// HELPERS — pure, no I/O
// ═══════════════════════════════════════════════════════════════

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function defaultClock() {
  return new Date();
}

function defaultRandomId(prefix) {
  const rand = crypto.randomBytes(8).toString('hex');
  return `${prefix}-${Date.now()}-${rand}`;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
    Object.freeze(obj);
  }
  return obj;
}

function sha256(input) {
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  return crypto.createHash('sha256').update(str).digest('hex');
}

// ═══════════════════════════════════════════════════════════════
// ENCRYPTION — AES-256-GCM
// ═══════════════════════════════════════════════════════════════

/**
 * Derive a 32-byte key from caller-supplied secret + salt via scryptSync.
 * If the caller already hands us a 32-byte Buffer, use it directly.
 */
function deriveKey(secret, salt) {
  if (Buffer.isBuffer(secret) && secret.length === 32) return secret;
  const passphrase = typeof secret === 'string' ? secret : String(secret || '');
  if (!passphrase) {
    throw new Error('GrievanceSystem: encryptionKey is required (string or 32-byte Buffer)');
  }
  return crypto.scryptSync(passphrase, salt, 32);
}

/**
 * Encrypt an arbitrary JSON-serialisable payload.
 * Returns an envelope object safe to persist to disk / db.
 */
function encryptPayload(payload, secret) {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const salt = crypto.randomBytes(32);
  const iv   = crypto.randomBytes(12);
  const key  = deriveKey(secret, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct  = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ct: ct.toString('hex'),
  };
}

/** Decrypt an envelope produced by encryptPayload(). */
function decryptPayload(envelope, secret) {
  if (!envelope || envelope.alg !== 'aes-256-gcm' || envelope.v !== 1) {
    throw new Error('GrievanceSystem: unsupported encryption envelope');
  }
  const salt = Buffer.from(envelope.salt, 'hex');
  const iv   = Buffer.from(envelope.iv,   'hex');
  const tag  = Buffer.from(envelope.tag,  'hex');
  const ct   = Buffer.from(envelope.ct,   'hex');
  const key  = deriveKey(secret, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

// ═══════════════════════════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════════════════════════

class GrievanceSystem {
  /**
   * @param {object} opts
   * @param {string|Buffer} [opts.encryptionKey] — default key for sensitive text.
   *        May be omitted; then encrypt() must be called with explicit key.
   * @param {Function}     [opts.clock]         — injectable clock (() => Date)
   * @param {Function}     [opts.randomId]      — injectable id generator
   * @param {object}       [opts.roles]         — override/extend DEFAULT_ROLES
   * @param {Function}     [opts.auditLog]      — optional sink for audit entries
   */
  constructor(opts = {}) {
    this.encryptionKey = opts.encryptionKey || null;
    this.clock    = typeof opts.clock    === 'function' ? opts.clock    : defaultClock;
    this.randomId = typeof opts.randomId === 'function' ? opts.randomId : defaultRandomId;
    this.auditLog = typeof opts.auditLog === 'function' ? opts.auditLog : null;
    this.roles    = Object.assign({}, DEFAULT_ROLES, opts.roles || {});
    /** complaintId -> complaint record (in-memory store) */
    this.complaints = new Map();
    /** append-only audit trail (in-memory) */
    this.audit = [];
  }

  // ─────────────────────────────────────────────────────────────
  // FILE A COMPLAINT
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} input
   * @param {object} [input.complainant] — { id, name, role, email }. Optional if anonymous.
   * @param {boolean} [input.anonymous=false] — when true, complainant identity is scrubbed.
   * @param {string} input.category   — one of CATEGORIES keys
   * @param {string} input.description — free-text description (will be encrypted)
   * @param {Array}  [input.evidence]  — [{ type, name, hash, encrypted? }]
   * @param {Array}  [input.witnesses] — [{ id, name, contact, anonymous? }]
   * @param {string} [input.severity='medium'] — severity level
   * @returns {object} complaint record (public-safe view; sensitive text encrypted)
   */
  fileComplaint(input = {}) {
    if (!input || typeof input !== 'object') {
      throw new Error('fileComplaint: input object required');
    }
    const category = input.category;
    if (!Object.prototype.hasOwnProperty.call(CATEGORIES, category)) {
      throw new Error(`fileComplaint: invalid category '${category}'. Allowed: ${Object.keys(CATEGORIES).join(', ')}`);
    }
    const severity = input.severity || 'medium';
    if (!Object.prototype.hasOwnProperty.call(SEVERITY, severity)) {
      throw new Error(`fileComplaint: invalid severity '${severity}'`);
    }
    if (!isNonEmptyString(input.description)) {
      throw new Error('fileComplaint: description is required');
    }
    const anonymous = input.anonymous === true;
    // Anonymity rule: for sensitive cats (harassment / retaliation / ethics)
    // we allow fully anonymous filings. For pay/discrimination, still allowed.
    if (!anonymous && (!input.complainant || !input.complainant.id)) {
      throw new Error('fileComplaint: complainant.id is required when not anonymous');
    }

    const now = this.clock();
    const id = this.randomId('grv');
    const route = STATUTORY_ROUTE[category] || STATUTORY_ROUTE.other;
    const sla = SEVERITY[severity].slaDays;

    // Build the complainant block — scrub if anonymous.
    const complainantBlock = anonymous
      ? {
          anonymous: true,
          pseudonym: `anon-${crypto.randomBytes(4).toString('hex')}`,
          // Keep a one-way hash so we can tie later correspondence
          // to the same anon source WITHOUT ever storing identity.
          anonToken: input.complainant && input.complainant.id
            ? sha256(`${input.complainant.id}:${id}`)
            : null,
        }
      : {
          anonymous: false,
          id:    input.complainant.id,
          name:  input.complainant.name  || null,
          role:  input.complainant.role  || null,
          email: input.complainant.email || null,
        };

    // Sensitive free-text description goes into an encrypted envelope.
    let encryptedDescription = null;
    if (this.encryptionKey) {
      encryptedDescription = encryptPayload(
        { description: input.description, evidence: input.evidence || [] },
        this.encryptionKey,
      );
    }

    // Protected-from-retaliation flag — on by law for several categories,
    // AND always on for anonymous filings.
    const protectedFromRetaliation = Boolean(route.retaliationProtection) || anonymous;

    const complaint = {
      id,
      filedAt: now.toISOString(),
      status: STATUS.FILED,
      category,
      severity,
      categoryLabel: CATEGORIES[category],
      severityLabel: SEVERITY[severity],
      complainant: complainantBlock,
      // description is NEVER stored in plaintext when a key is available.
      description: this.encryptionKey ? null : input.description,
      descriptionEnc: encryptedDescription,
      evidence: (input.evidence || []).map((e) => ({
        type: e.type || 'file',
        name: e.name || 'evidence',
        hash: e.hash || sha256(e.name || ''),
        encrypted: Boolean(e.encrypted),
      })),
      witnesses: (input.witnesses || []).map((w, i) => ({
        index: i,
        id:    w.anonymous ? null : (w.id || null),
        name:  w.anonymous ? null : (w.name || null),
        contact: w.anonymous ? null : (w.contact || null),
        anonymous: Boolean(w.anonymous),
      })),
      investigator: null,
      investigatorAssignedAt: null,
      interviews: [],
      hearings: [],
      verdict: null,
      appeal: null,
      retaliationWatch: null,
      retaliationIncidents: [],
      statutory: {
        required: Boolean(route.statute),
        statute: route.statute || null,
        ministryNotifiable: Boolean(route.ministryNotifiable),
        investigationDeadline: new Date(
          now.getTime() + (route.investigationDays || 14) * 86400000,
        ).toISOString(),
      },
      protectedFromRetaliation,
      slaDays: sla,
      slaDeadline: new Date(now.getTime() + sla * 86400000).toISOString(),
      allowedRoles: this._defaultAllowedRoles(category, anonymous),
      history: [],
    };

    this._append(complaint, 'filed', {
      actor: anonymous ? 'anonymous' : complainantBlock.id,
      at: now.toISOString(),
    });
    this.complaints.set(id, complaint);
    return this._publicView(complaint);
  }

  // ─────────────────────────────────────────────────────────────
  // ASSIGN INVESTIGATOR — with conflict-of-interest check
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {string} complaintId
   * @param {object} investigator — { id, name, role, relationships? }
   *      relationships: array of { targetId, kind } describing known links
   *      to the complainant, the subject, or witnesses.
   * @returns {object} { assigned, conflictOfInterest, reason }
   */
  assignInvestigator(complaintId, investigator) {
    const c = this._getOrThrow(complaintId);
    if (!investigator || !investigator.id) {
      throw new Error('assignInvestigator: investigator.id required');
    }
    // Conflict-of-interest check:
    //   1. Investigator cannot be the complainant themselves.
    //   2. Investigator cannot share a known relationship with anyone
    //      in the witness list or with the complainant.
    //   3. For harassment cases, investigator must be in
    //      'harassment-officer' role.
    const coi = this._detectConflictOfInterest(c, investigator);
    if (coi.hasConflict) {
      this._append(c, 'investigator-coi-blocked', {
        investigator: investigator.id,
        reason: coi.reason,
      });
      return { assigned: false, conflictOfInterest: true, reason: coi.reason };
    }
    if (c.category === 'harassment' && investigator.role !== 'harassment-officer') {
      const reason = {
        he: 'חובה למנות אחראי/ת למניעת הטרדה מינית',
        en: 'Harassment cases require a harassment officer (אחראי/ת)',
      };
      this._append(c, 'investigator-role-blocked', { investigator: investigator.id, reason });
      return { assigned: false, conflictOfInterest: false, reason };
    }
    c.investigator = {
      id: investigator.id,
      name: investigator.name || null,
      role: investigator.role || 'hr-officer',
    };
    c.investigatorAssignedAt = this.clock().toISOString();
    c.status = STATUS.INVESTIGATING;
    this._append(c, 'investigator-assigned', {
      investigator: investigator.id,
      role: investigator.role || 'hr-officer',
    });
    return { assigned: true, conflictOfInterest: false, reason: null };
  }

  // ─────────────────────────────────────────────────────────────
  // RECORD INTERVIEW
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} input — { complaintId, subject, content, consent }
   *   subject: { id, name, role } — who was interviewed
   *   content: free text (will be encrypted if key present)
   *   consent: must be true — required by חוק הגנת הפרטיות
   */
  recordInterview(input = {}) {
    const c = this._getOrThrow(input.complaintId);
    if (!input.subject || !input.subject.id) {
      throw new Error('recordInterview: subject.id required');
    }
    if (!isNonEmptyString(input.content)) {
      throw new Error('recordInterview: content required');
    }
    if (input.consent !== true) {
      throw new Error('recordInterview: explicit consent required (חוק הגנת הפרטיות)');
    }
    const now = this.clock();
    const interview = {
      id: this.randomId('int'),
      at: now.toISOString(),
      subject: {
        id: input.subject.id,
        name: input.subject.name || null,
        role: input.subject.role || null,
      },
      consent: true,
      contentEnc: this.encryptionKey ? encryptPayload({ content: input.content }, this.encryptionKey) : null,
      content:    this.encryptionKey ? null : input.content,
      hash: sha256(input.content),
    };
    c.interviews.push(interview);
    this._append(c, 'interview-recorded', { interviewId: interview.id, subject: input.subject.id });
    return { interviewId: interview.id, at: interview.at, hash: interview.hash };
  }

  // ─────────────────────────────────────────────────────────────
  // SCHEDULE HEARINGS — formal process
  // ─────────────────────────────────────────────────────────────
  /**
   * Creates a hearing plan with pre-hearing notice, hearing date,
   * deliberation and response windows per חוק שימוע (דוקטרינת השימוע).
   */
  scheduleHearings(complaintId) {
    const c = this._getOrThrow(complaintId);
    if (c.status === STATUS.CLOSED) {
      throw new Error('scheduleHearings: complaint already closed');
    }
    const now = this.clock();
    // Hearing doctrine (דוקטרינת השימוע) minimums:
    //   - at least 48h pre-hearing notice
    //   - reasonable time to respond before decision
    const notice     = new Date(now.getTime() + 2 * 86400000);
    const hearingAt  = new Date(now.getTime() + 7 * 86400000);
    const respondBy  = new Date(hearingAt.getTime() + 3 * 86400000);
    const decideBy   = new Date(respondBy.getTime() + 7 * 86400000);
    const plan = {
      id: this.randomId('hrg'),
      scheduledAt: now.toISOString(),
      notice:    notice.toISOString(),
      hearingAt: hearingAt.toISOString(),
      respondBy: respondBy.toISOString(),
      decideBy:  decideBy.toISOString(),
      status: 'scheduled',
      participants: [],
    };
    c.hearings.push(plan);
    c.status = STATUS.HEARING;
    this._append(c, 'hearing-scheduled', { hearingId: plan.id, hearingAt: plan.hearingAt });
    return plan;
  }

  // ─────────────────────────────────────────────────────────────
  // DECIDE VERDICT
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} input — { complaintId, finding, actions, appeal }
   *   finding: 'substantiated' | 'unsubstantiated' | 'partially-substantiated' | 'inconclusive'
   *   actions: array of corrective actions { type, target, detail }
   *   appeal:  { allowed: bool, deadline: ISO, process: string }
   */
  decideVerdict(input = {}) {
    const c = this._getOrThrow(input.complaintId);
    const validFindings = ['substantiated', 'unsubstantiated', 'partially-substantiated', 'inconclusive'];
    if (!validFindings.includes(input.finding)) {
      throw new Error(`decideVerdict: invalid finding '${input.finding}'`);
    }
    if (!Array.isArray(input.actions)) {
      throw new Error('decideVerdict: actions array required');
    }
    const now = this.clock();
    const verdict = {
      at: now.toISOString(),
      finding: input.finding,
      findingLabel: this._findingLabel(input.finding),
      actions: input.actions.map((a) => ({
        type: a.type || 'note',
        target: a.target || null,
        detail: a.detail || '',
      })),
      appeal: input.appeal && input.appeal.allowed
        ? {
            allowed: true,
            deadline: input.appeal.deadline
              ? new Date(input.appeal.deadline).toISOString()
              : new Date(now.getTime() + 14 * 86400000).toISOString(),
            process: input.appeal.process || 'internal',
          }
        : { allowed: false },
    };
    c.verdict = verdict;
    c.status  = STATUS.DECIDED;
    this._append(c, 'verdict-decided', { finding: verdict.finding });
    return verdict;
  }

  // ─────────────────────────────────────────────────────────────
  // RETALIATION MONITOR
  // ─────────────────────────────────────────────────────────────
  /**
   * Opens a retaliation-watch window (default 180 days) during which
   * any adverse personnel action against the complainant must be
   * cross-checked with this complaint. Returns a monitor object that
   * can be updated with incidents via `.reportRetaliation(...)`.
   *
   * Per חוק הגנה על עובדים (חשיפת עבירות), the burden of proof in
   * disputes during this window may shift to the employer.
   */
  retaliationMonitor(complaintId, daysAfter = 180) {
    const c = this._getOrThrow(complaintId);
    const now = this.clock();
    const until = new Date(now.getTime() + daysAfter * 86400000);
    const monitor = {
      id: this.randomId('mon'),
      openedAt: now.toISOString(),
      until: until.toISOString(),
      daysAfter,
      complainantId: c.complainant.anonymous ? null : c.complainant.id,
      anonToken: c.complainant.anonymous ? c.complainant.anonToken : null,
      incidents: [],
      status: 'active',
    };
    c.retaliationWatch = monitor;
    if (c.status === STATUS.DECIDED || c.status === STATUS.CLOSED) {
      c.status = STATUS.MONITORING;
    }
    this._append(c, 'retaliation-monitor-opened', { until: monitor.until, daysAfter });
    return monitor;
  }

  /**
   * Report a potentially retaliatory action. The system records it,
   * marks it for review, and raises the severity of the complaint.
   */
  reportRetaliation(complaintId, incident = {}) {
    const c = this._getOrThrow(complaintId);
    if (!c.retaliationWatch || c.retaliationWatch.status !== 'active') {
      throw new Error('reportRetaliation: no active retaliation monitor');
    }
    const now = this.clock();
    const rec = {
      id: this.randomId('ret'),
      at: now.toISOString(),
      type: incident.type || 'unspecified',
      actor: incident.actor || null,
      detail: incident.detail || '',
      reviewed: false,
      substantiated: null,
    };
    c.retaliationWatch.incidents.push(rec);
    c.retaliationIncidents.push(rec);
    this._append(c, 'retaliation-incident-reported', { incidentId: rec.id, type: rec.type });
    return rec;
  }

  /**
   * Returns true if the monitor window is still open at the given time.
   */
  isRetaliationWindowOpen(complaintId, atTime) {
    const c = this._getOrThrow(complaintId);
    if (!c.retaliationWatch) return false;
    const at = atTime ? new Date(atTime) : this.clock();
    return at.getTime() < new Date(c.retaliationWatch.until).getTime()
        && c.retaliationWatch.status === 'active';
  }

  // ─────────────────────────────────────────────────────────────
  // ENCRYPT / DECRYPT  (public helpers)
  // ─────────────────────────────────────────────────────────────
  /**
   * Encrypts a complaint (or any payload) under this system's key.
   * Accepts either a complaint record or arbitrary object.
   */
  encrypt(complaint, explicitKey) {
    const key = explicitKey || this.encryptionKey;
    if (!key) throw new Error('encrypt: no encryption key available');
    return encryptPayload(complaint, key);
  }

  /** Decrypt an envelope previously produced by encrypt(). */
  decrypt(envelope, explicitKey) {
    const key = explicitKey || this.encryptionKey;
    if (!key) throw new Error('decrypt: no encryption key available');
    return decryptPayload(envelope, key);
  }

  // ─────────────────────────────────────────────────────────────
  // RESTRICT ACCESS — RBAC
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} input — { complaintId, allowedRoles }
   *   allowedRoles: string[] — must be a subset of this.roles keys.
   */
  restrictAccess(input = {}) {
    const c = this._getOrThrow(input.complaintId);
    if (!Array.isArray(input.allowedRoles)) {
      throw new Error('restrictAccess: allowedRoles array required');
    }
    const validRoles = Object.keys(this.roles);
    for (const r of input.allowedRoles) {
      if (!validRoles.includes(r)) {
        throw new Error(`restrictAccess: unknown role '${r}'`);
      }
    }
    c.allowedRoles = input.allowedRoles.slice();
    this._append(c, 'access-restricted', { allowedRoles: c.allowedRoles });
    return { complaintId: c.id, allowedRoles: c.allowedRoles };
  }

  /**
   * Returns true if the actor is allowed to view the complaint.
   * The actor must supply { id, role }.
   */
  checkAccess(complaintId, actor) {
    const c = this._getOrThrow(complaintId);
    if (!actor || !actor.role) return false;
    if (!c.allowedRoles.includes(actor.role)) return false;
    const perms = this.roles[actor.role];
    if (!perms) return false;
    if (perms.view === true) return true;
    if (perms.view === 'own') {
      if (c.complainant.anonymous) return false; // anon cases NEVER viewable by 'own' path
      return actor.id && actor.id === c.complainant.id;
    }
    return false;
  }

  /**
   * RBAC-gated reader. Returns the public view of the complaint
   * if the actor is allowed, else throws.
   */
  getComplaint(complaintId, actor) {
    const c = this._getOrThrow(complaintId);
    if (!this.checkAccess(complaintId, actor)) {
      throw new Error('getComplaint: access denied');
    }
    return this._publicView(c);
  }

  // ─────────────────────────────────────────────────────────────
  // STATUTORY REPORT
  // ─────────────────────────────────────────────────────────────
  /**
   * Aggregated report for the Israeli Ministry of Labor.
   * @param {object} period — { from: Date|string, to: Date|string }
   * @returns {object} { period, totals, byCategory, bySeverity, notifiable }
   */
  statutoryReport(period = {}) {
    const from = period.from ? new Date(period.from) : new Date(0);
    const to   = period.to   ? new Date(period.to)   : this.clock();
    const inWindow = (iso) => {
      const t = new Date(iso).getTime();
      return t >= from.getTime() && t <= to.getTime();
    };
    const matching = [...this.complaints.values()].filter((c) => inWindow(c.filedAt));
    const byCategory = {};
    const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    let notifiable = 0;
    let anonymous  = 0;
    let substantiated = 0;
    let openRetaliation = 0;
    for (const c of matching) {
      byCategory[c.category] = (byCategory[c.category] || 0) + 1;
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      if (c.statutory && c.statutory.ministryNotifiable) notifiable++;
      if (c.complainant.anonymous) anonymous++;
      if (c.verdict && c.verdict.finding === 'substantiated') substantiated++;
      if (c.retaliationWatch && c.retaliationWatch.status === 'active') openRetaliation++;
    }
    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        filed: matching.length,
        anonymous,
        substantiated,
        openRetaliationMonitors: openRetaliation,
        ministryNotifiable: notifiable,
      },
      byCategory,
      bySeverity,
      labels: LABELS,
      // Only aggregated counts — never identities — leave the system.
      privacyNote: {
        he: 'דו"ח זה מכיל אגרגציה בלבד. פרטי מתלוננים מוצפנים ואינם נחשפים.',
        en: 'This report contains aggregates only. Complainant identities remain encrypted and are never exposed.',
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // APPEAL PROCESS
  // ─────────────────────────────────────────────────────────────
  /**
   * Opens an appeal on a decided complaint.
   * Escalation path: hr-officer -> legal -> ceo -> external arbitration.
   */
  appealProcess(complaintId) {
    const c = this._getOrThrow(complaintId);
    if (!c.verdict) {
      throw new Error('appealProcess: no verdict to appeal');
    }
    if (c.verdict.appeal && c.verdict.appeal.allowed === false) {
      throw new Error('appealProcess: appeal not allowed by verdict');
    }
    const now = this.clock();
    const deadlineIso = c.verdict.appeal && c.verdict.appeal.deadline
      ? c.verdict.appeal.deadline
      : new Date(now.getTime() + 14 * 86400000).toISOString();
    if (now.getTime() > new Date(deadlineIso).getTime()) {
      throw new Error('appealProcess: appeal deadline has passed');
    }
    const appeal = {
      id: this.randomId('app'),
      openedAt: now.toISOString(),
      deadline: deadlineIso,
      status: 'pending-review',
      escalationPath: [
        { level: 1, role: 'legal',    status: 'pending', openedAt: now.toISOString() },
        { level: 2, role: 'ceo',      status: 'pending', openedAt: null },
        { level: 3, role: 'external', status: 'pending', openedAt: null, note: 'חיצוני (בית דין לעבודה)' },
      ],
      outcome: null,
    };
    c.appeal = appeal;
    c.status = STATUS.APPEALED;
    this._append(c, 'appeal-opened', { appealId: appeal.id });
    return appeal;
  }

  /**
   * Advance appeal to next escalation level.
   */
  escalateAppeal(complaintId, outcomeAtCurrentLevel) {
    const c = this._getOrThrow(complaintId);
    if (!c.appeal) throw new Error('escalateAppeal: no open appeal');
    const path = c.appeal.escalationPath;
    const idx = path.findIndex((step) => step.status === 'pending');
    if (idx === -1) {
      c.appeal.status = 'exhausted';
      this._append(c, 'appeal-exhausted', {});
      return c.appeal;
    }
    path[idx].status = outcomeAtCurrentLevel === 'upheld' ? 'upheld' : 'rejected';
    path[idx].closedAt = this.clock().toISOString();
    if (outcomeAtCurrentLevel === 'upheld') {
      c.appeal.outcome = 'upheld';
      c.appeal.status  = 'resolved';
      this._append(c, 'appeal-upheld', { level: path[idx].level });
    } else if (idx + 1 < path.length) {
      path[idx + 1].openedAt = this.clock().toISOString();
      this._append(c, 'appeal-escalated', { nextLevel: path[idx + 1].level });
    } else {
      c.appeal.outcome = 'rejected';
      c.appeal.status  = 'resolved';
      this._append(c, 'appeal-rejected', {});
    }
    return c.appeal;
  }

  // ═════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═════════════════════════════════════════════════════════════

  _getOrThrow(id) {
    const c = this.complaints.get(id);
    if (!c) throw new Error(`GrievanceSystem: complaint '${id}' not found`);
    return c;
  }

  _append(complaint, event, payload) {
    const entry = {
      at: this.clock().toISOString(),
      event,
      payload,
      prevHash: complaint.history.length
        ? complaint.history[complaint.history.length - 1].hash
        : null,
    };
    entry.hash = sha256(JSON.stringify({
      id: complaint.id, at: entry.at, event, payload, prevHash: entry.prevHash,
    }));
    complaint.history.push(entry);
    this.audit.push({ complaintId: complaint.id, ...entry });
    if (this.auditLog) {
      try { this.auditLog({ complaintId: complaint.id, ...entry }); } catch (_) { /* isolate */ }
    }
  }

  _defaultAllowedRoles(category, anonymous) {
    const base = ['hr-officer', 'legal', 'ceo'];
    if (category === 'harassment') base.unshift('harassment-officer');
    if (!anonymous) base.push('complainant');
    return base;
  }

  _detectConflictOfInterest(complaint, investigator) {
    // Rule 1: investigator cannot be the complainant.
    if (!complaint.complainant.anonymous && investigator.id === complaint.complainant.id) {
      return {
        hasConflict: true,
        reason: { he: 'החוקר/ת הוא המתלונן עצמו', en: 'Investigator is the complainant' },
      };
    }
    // Rule 2: investigator cannot be listed as a witness.
    for (const w of complaint.witnesses) {
      if (w.id && w.id === investigator.id) {
        return {
          hasConflict: true,
          reason: { he: 'החוקר/ת רשום/ה כעד', en: 'Investigator is listed as a witness' },
        };
      }
    }
    // Rule 3: declared relationships.
    const rels = Array.isArray(investigator.relationships) ? investigator.relationships : [];
    for (const r of rels) {
      if (!complaint.complainant.anonymous && r.targetId === complaint.complainant.id) {
        return {
          hasConflict: true,
          reason: {
            he: `קרבה אישית למתלונן (${r.kind || 'יחס'})`,
            en: `Personal relationship with complainant (${r.kind || 'relation'})`,
          },
        };
      }
      for (const w of complaint.witnesses) {
        if (w.id && w.id === r.targetId) {
          return {
            hasConflict: true,
            reason: {
              he: `קרבה אישית לעד (${r.kind || 'יחס'})`,
              en: `Personal relationship with witness (${r.kind || 'relation'})`,
            },
          };
        }
      }
    }
    return { hasConflict: false, reason: null };
  }

  _findingLabel(finding) {
    const map = {
      substantiated:              { he: 'מבוססת',        en: 'Substantiated' },
      'partially-substantiated':  { he: 'מבוססת חלקית', en: 'Partially substantiated' },
      unsubstantiated:            { he: 'לא מבוססת',     en: 'Unsubstantiated' },
      inconclusive:               { he: 'לא חד-משמעית', en: 'Inconclusive' },
    };
    return map[finding] || { he: finding, en: finding };
  }

  /**
   * Return a read-safe view of the complaint. Sensitive plaintext
   * description / interview content is NEVER included; only the
   * encrypted envelope (if any) plus hashes and metadata.
   */
  _publicView(c) {
    return {
      id: c.id,
      filedAt: c.filedAt,
      status: c.status,
      category: c.category,
      severity: c.severity,
      categoryLabel: c.categoryLabel,
      severityLabel: c.severityLabel,
      complainant: c.complainant,
      descriptionEncrypted: Boolean(c.descriptionEnc),
      descriptionEnc: c.descriptionEnc, // envelope is opaque, safe to return
      description: c.description,        // only populated when no key was set
      evidence: c.evidence,
      witnessCount: c.witnesses.length,
      investigator: c.investigator,
      investigatorAssignedAt: c.investigatorAssignedAt,
      interviewCount: c.interviews.length,
      hearings: c.hearings,
      verdict: c.verdict,
      appeal: c.appeal,
      retaliationWatch: c.retaliationWatch,
      retaliationIncidentCount: c.retaliationIncidents.length,
      statutory: c.statutory,
      protectedFromRetaliation: c.protectedFromRetaliation,
      slaDays: c.slaDays,
      slaDeadline: c.slaDeadline,
      allowedRoles: c.allowedRoles,
      historyCount: c.history.length,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  GrievanceSystem,
  // constants for callers / tests
  CATEGORIES,
  SEVERITY,
  STATUS,
  STATUTORY_ROUTE,
  DEFAULT_ROLES,
  LABELS,
  // pure crypto helpers — exposed for tests / interop
  _internals: deepFreeze({
    encryptPayload,
    decryptPayload,
    deriveKey,
    sha256,
  }),
};
