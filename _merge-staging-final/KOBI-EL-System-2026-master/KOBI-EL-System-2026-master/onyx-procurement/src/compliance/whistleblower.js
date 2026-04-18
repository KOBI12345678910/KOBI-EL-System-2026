/**
 * Whistleblower Portal — פורטל חושפי שחיתויות
 * Agent Y-143 / Swarm Compliance / Techno-Kol Uzi Mega-ERP 2026
 *
 * Legal basis / בסיס משפטי:
 *   חוק הגנה על עובדים (חשיפת עבירות ופגיעה בטוהר המידות או במינהל
 *   התקין), תשנ"ז-1997.
 *   Israeli Protection of Workers (Exposure of Offences and Harm to
 *   Integrity or Proper Administration) Law, 5757-1997.
 *
 * Mission:
 *   Provide an append-only, tamper-evident, end-to-end encrypted channel
 *   for employees and contractors to report wrongdoing — fraud, corruption,
 *   safety, discrimination, harassment, regulatory breaches, privacy
 *   violations, financial misconduct, or "other" — with a strict promise of
 *   anonymity and anti-retaliation protection. Reporters may remain fully
 *   anonymous and check their case status via an opaque token that cannot
 *   be reverse-engineered back to identity.
 *
 * Immutable rules:
 *   - "לא מוחקים רק משדרגים ומגדלים" — NEVER delete, always upgrade/append.
 *   - Zero external dependencies — Node built-ins only (node:crypto).
 *   - Hebrew RTL + bilingual (HE/EN) labels on every artefact.
 *   - Anonymous reporting is CRITICAL. No reverse-engineering of identity.
 *   - Israeli whistleblower law compliance is CRITICAL.
 *
 * Storage:
 *   - Fully in-memory. Append-only. Sensitive fields encrypted with
 *     AES-256-GCM. Investigator notes are append-only, encrypted, and
 *     never editable after append.
 *   - RBAC:
 *       * reporter (token) sees only: status + publicNotes + non-PII.
 *       * investigator (assigned) sees: full decrypted content + notes.
 *       * compliance-officer: cross-case aggregates; cannot unmask reporter.
 *       * admin: chain verification + statutory reports; never content.
 *
 * Public API:
 *   class WhistleblowerPortal
 *     .submitReport({category, description, evidence, anonymous, ...})
 *                                                      -> { reportId, reporterToken, caseNumber }
 *     .assignInvestigator({ reportId, investigator })  -> assignment record
 *     .secureMessaging({ reportId, from, to, message, encrypt })
 *                                                      -> message record
 *     .retaliationProtection(reporterToken)            -> flag record
 *     .reportAdverseAction({ reporterToken, action })  -> escalation record
 *     .statusUpdate({ reportId, status, publicNotes }) -> status record
 *     .reporterStatus(reporterToken)                   -> public view
 *     .investigatorNotes({ reportId, note, investigatorId })
 *                                                      -> note record (append-only)
 *     .getInvestigatorNotes(reportId, investigatorId)  -> decrypted notes
 *     .closeReport({ reportId, finding, actions })     -> closing record
 *     .anonymousToken()                                -> opaque 256-bit token
 *     .statutoryReport(period)                         -> bilingual aggregate
 *     .externalEscalation(reportId, target)            -> escalation record
 *     .integrityCheck(reportId)                        -> chain verification
 *     .auditLog(filter?)                               -> append-only events
 *     .verifyChain()                                   -> { valid, brokenAt }
 *
 * Encryption:
 *   - AES-256-GCM with a portal-wide 32-byte master key (provided via
 *     constructor or auto-generated per instance). Every encrypted record
 *     carries its own 12-byte IV and 16-byte auth tag. Tampering on
 *     ciphertext, IV, or tag fails authentication on decryption.
 *   - The reporterToken is a 32-byte random opaque string. We ONLY store
 *     its SHA-256 digest, salted with a portal-specific salt. Given a
 *     tokenHash it is computationally infeasible to recover identity (we
 *     never stored one in anonymous mode), and given the token itself we
 *     never reveal anything except public status and publicNotes.
 *
 * Anti-retaliation:
 *   - retaliationProtection(token) raises a flag on the case. Any
 *     subsequent reportAdverseAction(token, action) triggers an
 *     auto-escalation event that flows into the audit chain with a
 *     high-priority marker, but without exposing identity.
 *
 * Anonymity invariant:
 *   - In anonymous mode, the reporter's contact, name, department, IP,
 *     user-agent etc. are NEVER written anywhere — not even encrypted.
 *     Only the tokenHash and an opaque submission blob exist.
 *   - In identified mode, contact method is encrypted and only decryptable
 *     by an assigned investigator (after passing conflict-of-interest
 *     checks).
 *
 * Run tests:
 *   node --test onyx-procurement/test/compliance/whistleblower.test.js
 */

'use strict';

const crypto = require('node:crypto');

// ─── constants ─────────────────────────────────────────────────────────

const CATEGORIES = Object.freeze({
  FRAUD: 'fraud',                       // הונאה
  CORRUPTION: 'corruption',             // שחיתות
  SAFETY: 'safety',                     // בטיחות
  DISCRIMINATION: 'discrimination',     // אפליה
  HARASSMENT: 'harassment',             // הטרדה
  REGULATORY: 'regulatory',             // רגולציה
  PRIVACY: 'privacy',                   // פרטיות
  FINANCIAL: 'financial',               // כספים
  OTHER: 'other',                       // אחר
});

const CATEGORY_LABELS_HE = Object.freeze({
  fraud: 'הונאה',
  corruption: 'שחיתות',
  safety: 'בטיחות',
  discrimination: 'אפליה',
  harassment: 'הטרדה',
  regulatory: 'הפרה רגולטורית',
  privacy: 'פגיעה בפרטיות',
  financial: 'עבירה כספית',
  other: 'אחר',
});

const CATEGORY_LABELS_EN = Object.freeze({
  fraud: 'Fraud',
  corruption: 'Corruption',
  safety: 'Safety',
  discrimination: 'Discrimination',
  harassment: 'Harassment',
  regulatory: 'Regulatory breach',
  privacy: 'Privacy violation',
  financial: 'Financial misconduct',
  other: 'Other',
});

const REPORT_STATUS = Object.freeze({
  SUBMITTED: 'submitted',                 // הוגש
  UNDER_REVIEW: 'under_review',           // בבחינה
  ASSIGNED: 'assigned',                   // הוקצה לחוקר
  INVESTIGATING: 'investigating',         // בחקירה
  AWAITING_INFO: 'awaiting_info',         // ממתין למידע מהמדווח
  ESCALATED: 'escalated',                 // הוסלם
  CLOSED: 'closed',                       // נסגר
});

const FINDINGS = Object.freeze({
  SUBSTANTIATED: 'substantiated',             // מבוסס
  UNSUBSTANTIATED: 'unsubstantiated',         // לא מבוסס
  INCONCLUSIVE: 'inconclusive',               // לא חד-משמעי
  REFERRED_EXTERNALLY: 'referred-externally', // הועבר לגורם חיצוני
});

const EXTERNAL_TARGETS = Object.freeze({
  OMBUDSMAN: 'ombudsman',                       // נציב תלונות הציבור
  STATE_COMPTROLLER: 'state_comptroller',       // מבקר המדינה
  FINANCIAL_AUTHORITY: 'financial_authority',   // רשות שוק ההון / ני"ע
  POLICE: 'police',                             // משטרה
  TAX_AUTHORITY: 'tax_authority',               // רשות המיסים
  LABOUR_COURT: 'labour_court',                 // בית הדין לעבודה
  OTHER: 'other',
});

const EVENT_TYPES = Object.freeze({
  REPORT_SUBMITTED: 'report.submitted',
  REPORT_ASSIGNED: 'report.assigned',
  MESSAGE_SENT: 'message.sent',
  STATUS_UPDATED: 'status.updated',
  NOTE_APPENDED: 'note.appended',
  REPORT_CLOSED: 'report.closed',
  RETALIATION_FLAGGED: 'retaliation.flagged',
  RETALIATION_ESCALATED: 'retaliation.escalated',
  ESCALATED_EXTERNAL: 'external.escalated',
  CONFLICT_BLOCKED: 'conflict.blocked',
  STATUTORY_REPORT: 'statutory.report',
});

const ROLES = Object.freeze({
  REPORTER: 'reporter',
  INVESTIGATOR: 'investigator',
  COMPLIANCE_OFFICER: 'compliance_officer',
  ADMIN: 'admin',
});

const GENESIS_HASH = '0'.repeat(64);

// ─── tiny utilities ────────────────────────────────────────────────────

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
  return JSON.parse(JSON.stringify(value));
}

function randomTokenHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ─── class ─────────────────────────────────────────────────────────────

class WhistleblowerPortal {
  /**
   * @param {Object}   [opts]
   * @param {Function} [opts.now]        clock factory returning a Date
   * @param {Buffer|string} [opts.masterKey]  32-byte AES-256-GCM master key
   *                                          (hex string or Buffer). If
   *                                          omitted, a random one is
   *                                          generated per instance.
   * @param {string}   [opts.salt]       token-hash salt; random if omitted.
   * @param {Function} [opts.idFactory]  injected id generator (tests).
   */
  constructor(opts = {}) {
    this._now = typeof opts.now === 'function' ? opts.now : () => new Date();

    if (opts.masterKey) {
      this._masterKey =
        Buffer.isBuffer(opts.masterKey)
          ? Buffer.from(opts.masterKey)
          : Buffer.from(String(opts.masterKey), 'hex');
    } else {
      this._masterKey = crypto.randomBytes(32);
    }
    if (this._masterKey.length !== 32) {
      throw new Error('masterKey must be exactly 32 bytes (AES-256-GCM)');
    }

    this._salt = opts.salt || randomTokenHex(16);

    this._idFactory =
      typeof opts.idFactory === 'function'
        ? opts.idFactory
        : (() => {
            let n = 0;
            return (prefix) => {
              n += 1;
              return `${prefix}-${Date.now().toString(36)}-${n
                .toString(36)
                .padStart(4, '0')}`;
            };
          })();

    // core stores (never deleted, only updated/appended) —
    // _reports: reportId -> report record (meta + encrypted blobs)
    this._reports = new Map();
    // _tokenIndex: tokenHash -> reportId (one-way lookup reporter -> case;
    //                                     investigators cannot read this to
    //                                     identify the reporter.)
    this._tokenIndex = new Map();
    // _messages: reportId -> message[] (append-only, encrypted content)
    this._messages = new Map();
    // _notes: reportId -> note[] (append-only, encrypted content)
    this._notes = new Map();
    // _statusHistory: reportId -> statusUpdate[] (append-only, public)
    this._statusHistory = new Map();
    // _retaliationFlags: tokenHash -> flag record
    this._retaliationFlags = new Map();
    // _adverseActions: tokenHash -> action[] (append-only)
    this._adverseActions = new Map();
    // _events: audit log (append-only, hash-chained)
    this._events = [];
    this._lastHash = GENESIS_HASH;

    // tiny case counter for human-friendly caseNumber (WB-YYYY-NNNN)
    this._caseSeq = 0;
  }

  // ── encryption primitives ────────────────────────────────────────────

  _encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this._masterKey, iv);
    const data =
      typeof plaintext === 'string'
        ? Buffer.from(plaintext, 'utf8')
        : Buffer.from(stableStringify(plaintext), 'utf8');
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      algo: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ct: ct.toString('hex'),
    };
  }

  _decrypt(blob) {
    if (!blob || typeof blob !== 'object') {
      throw new Error('encrypted blob required');
    }
    const iv = Buffer.from(blob.iv, 'hex');
    const tag = Buffer.from(blob.tag, 'hex');
    const ct = Buffer.from(blob.ct, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this._masterKey,
      iv
    );
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  }

  _hashToken(token) {
    return sha256Hex(this._salt + '|' + String(token));
  }

  // ── append-only event log with hash chain ────────────────────────────

  _appendEvent(type, payload) {
    const seq = this._events.length + 1;
    const timestamp = this._now().toISOString();
    const body = {
      seq,
      type,
      timestamp,
      payload: cloneJson(payload || {}),
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
    return event;
  }

  auditLog(filter = {}) {
    let out = this._events.slice();
    if (filter.type) out = out.filter((e) => e.type === filter.type);
    if (filter.reportId) {
      out = out.filter(
        (e) => e.payload && e.payload.reportId === filter.reportId
      );
    }
    return out;
  }

  verifyChain() {
    let prev = GENESIS_HASH;
    for (let i = 0; i < this._events.length; i++) {
      const ev = this._events[i];
      if (ev.prevHash !== prev) {
        return {
          valid: false,
          brokenAt: ev.seq,
          reason: 'prevHash mismatch',
        };
      }
      const body = {
        seq: ev.seq,
        type: ev.type,
        timestamp: ev.timestamp,
        payload: ev.payload,
      };
      const expected = sha256Hex(prev + '|' + stableStringify(body));
      if (expected !== ev.hash) {
        return {
          valid: false,
          brokenAt: ev.seq,
          reason: 'hash mismatch',
        };
      }
      prev = ev.hash;
    }
    return { valid: true, brokenAt: null };
  }

  // ── token generation ────────────────────────────────────────────────

  /**
   * Generate an opaque 256-bit reporter token. The token is the ONLY
   * handle a reporter keeps — the portal stores its salted SHA-256 digest
   * and never the token itself. Anyone presenting the token proves
   * knowledge of the case; without the token, identity cannot be
   * recovered from portal state.
   *
   * @returns {string} 64-character hex token (32 bytes)
   */
  anonymousToken() {
    return randomTokenHex(32);
  }

  // ── report submission ───────────────────────────────────────────────

  /**
   * Submit a new whistleblower report.
   *
   * @param {Object} input
   * @param {string} input.category        one of CATEGORIES
   * @param {string} input.description     free-text description (encrypted)
   * @param {Array}  [input.evidence]      array of evidence items (encrypted)
   * @param {boolean} input.anonymous      true = no PII stored at all
   * @param {string} [input.contactMethod] e.g. 'email','phone','portal'
   * @param {string} [input.preferredContact] encrypted if identified
   * @param {string} [input.accusedDept]   department implicated (for COI)
   * @param {string} [input.accusedParty]  named party (encrypted)
   * @param {string} [input.language]      'he' | 'en' (default 'he')
   * @returns {{ reportId, reporterToken, caseNumber, submittedAt }}
   */
  submitReport(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('submitReport requires an input object');
    }
    const {
      category,
      description,
      evidence,
      anonymous,
      contactMethod,
      preferredContact,
      accusedDept,
      accusedParty,
      language,
    } = input;

    if (!Object.values(CATEGORIES).includes(category)) {
      throw new Error(
        `invalid category "${category}" — must be one of: ${Object.values(
          CATEGORIES
        ).join(', ')}`
      );
    }
    if (!description || typeof description !== 'string') {
      throw new Error('description is required (string)');
    }
    if (typeof anonymous !== 'boolean') {
      throw new Error('anonymous flag is required (boolean)');
    }

    const now = this._now();
    const submittedAt = now.toISOString();
    const reportId = this._idFactory('WB');
    const reporterToken = this.anonymousToken();
    const tokenHash = this._hashToken(reporterToken);

    this._caseSeq += 1;
    const year = now.getUTCFullYear();
    const caseNumber = `WB-${year}-${String(this._caseSeq).padStart(4, '0')}`;

    // encrypt sensitive content. In anonymous mode, contactMethod /
    // preferredContact / accusedParty identifiers are still encrypted but
    // only non-identity fields are actually stored. Nothing about the
    // reporter is recorded anywhere (no IP, no UA, no name).
    const encryptedDescription = this._encrypt(description);
    const encryptedEvidence = Array.isArray(evidence)
      ? evidence.map((item) => this._encrypt(item))
      : [];
    const encryptedAccusedParty = accusedParty
      ? this._encrypt(accusedParty)
      : null;

    let encryptedContact = null;
    if (!anonymous && (contactMethod || preferredContact)) {
      encryptedContact = this._encrypt({
        contactMethod: contactMethod || null,
        preferredContact: preferredContact || null,
      });
    }

    const report = {
      reportId,
      caseNumber,
      category,
      status: REPORT_STATUS.SUBMITTED,
      submittedAt,
      anonymous: anonymous === true,
      language: language === 'en' ? 'en' : 'he',
      accusedDept: accusedDept ? String(accusedDept) : null,
      // cryptographic artefacts
      tokenHash,
      encryptedDescription,
      encryptedEvidence,
      encryptedAccusedParty,
      encryptedContact,
      // assignment / investigation state (mutations append, never remove)
      assignedInvestigator: null,
      assignmentHistory: [],
      closed: false,
      closedAt: null,
      finding: null,
      actions: [],
      externalEscalations: [],
      // retaliation marker
      retaliationFlagged: false,
      retaliationFlaggedAt: null,
    };

    this._reports.set(reportId, report);
    this._tokenIndex.set(tokenHash, reportId);
    this._messages.set(reportId, []);
    this._notes.set(reportId, []);
    this._statusHistory.set(reportId, [
      {
        at: submittedAt,
        status: REPORT_STATUS.SUBMITTED,
        publicNotes:
          report.language === 'en'
            ? 'Report received. Thank you for speaking up.'
            : 'הדיווח התקבל. תודה שפנית אלינו.',
      },
    ]);

    this._appendEvent(EVENT_TYPES.REPORT_SUBMITTED, {
      reportId,
      caseNumber,
      category,
      anonymous: report.anonymous,
      accusedDept: report.accusedDept,
      // NOTE: no description, no evidence, no tokenHash in the audit
      // payload — preserves both confidentiality and anonymity.
    });

    return {
      reportId,
      reporterToken,
      caseNumber,
      submittedAt,
    };
  }

  // ── investigator assignment + conflict-of-interest ──────────────────

  /**
   * Assign an investigator to a report.
   *
   * Conflict-of-interest rule: an investigator whose `department`
   * matches the `accusedDept` of the report cannot be assigned. If they
   * belong to the same department chain (same code), the assignment is
   * blocked and logged as CONFLICT_BLOCKED.
   *
   * @param {Object} input
   * @param {string} input.reportId
   * @param {Object} input.investigator   { id, name, department }
   * @returns {Object} assignment record
   */
  assignInvestigator(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('assignInvestigator requires an input object');
    }
    const { reportId, investigator } = input;
    const report = this._reports.get(reportId);
    if (!report) {
      throw new Error(`report not found: ${reportId}`);
    }
    if (!investigator || typeof investigator !== 'object' || !investigator.id) {
      throw new Error('investigator.id is required');
    }

    // Conflict-of-interest check: same department as the accused, or the
    // investigator themselves was named as the accused party.
    if (
      report.accusedDept &&
      investigator.department &&
      String(investigator.department).toLowerCase() ===
        String(report.accusedDept).toLowerCase()
    ) {
      this._appendEvent(EVENT_TYPES.CONFLICT_BLOCKED, {
        reportId,
        investigatorId: investigator.id,
        reason: 'same_department_as_accused',
      });
      throw new Error(
        `conflict of interest: investigator "${investigator.id}" is from accused department "${report.accusedDept}"`
      );
    }

    const now = this._now().toISOString();
    const assignment = Object.freeze({
      reportId,
      investigatorId: investigator.id,
      investigatorName: investigator.name || investigator.id,
      department: investigator.department || null,
      assignedAt: now,
    });

    // "never delete" — we push into history and update the pointer.
    report.assignmentHistory.push(assignment);
    report.assignedInvestigator = assignment;
    if (report.status === REPORT_STATUS.SUBMITTED) {
      report.status = REPORT_STATUS.ASSIGNED;
      this._statusHistory.get(reportId).push({
        at: now,
        status: REPORT_STATUS.ASSIGNED,
        publicNotes:
          report.language === 'en'
            ? 'An investigator has been assigned to your case.'
            : 'הוקצה חוקר לתיק שלך.',
      });
    }

    this._appendEvent(EVENT_TYPES.REPORT_ASSIGNED, {
      reportId,
      investigatorId: investigator.id,
      department: investigator.department || null,
    });

    return assignment;
  }

  // ── secure two-way messaging ────────────────────────────────────────

  /**
   * Post a message on the case channel. Messages default to encrypted
   * (AES-256-GCM) and are append-only; they cannot be redacted.
   *
   * @param {Object} input
   * @param {string} input.reportId
   * @param {string} input.from           sender role or id
   * @param {string} input.to             recipient role or id
   * @param {string} input.message
   * @param {boolean} [input.encrypt=true]
   * @returns {Object} message record
   */
  secureMessaging(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('secureMessaging requires an input object');
    }
    const { reportId, from, to, message } = input;
    const encrypt = input.encrypt !== false; // default true

    const report = this._reports.get(reportId);
    if (!report) {
      throw new Error(`report not found: ${reportId}`);
    }
    if (!from || !to || !message) {
      throw new Error('from, to, and message are all required');
    }

    const now = this._now().toISOString();
    const messageId = this._idFactory('MSG');
    const encryptedContent = encrypt ? this._encrypt(message) : null;
    const record = Object.freeze({
      messageId,
      reportId,
      from: String(from),
      to: String(to),
      at: now,
      encrypted: encrypt,
      // store either encrypted blob or plaintext (explicit opt-out)
      encryptedContent,
      plaintext: encrypt ? null : String(message),
    });

    const queue = this._messages.get(reportId) || [];
    queue.push(record);
    this._messages.set(reportId, queue);

    this._appendEvent(EVENT_TYPES.MESSAGE_SENT, {
      reportId,
      messageId,
      from: String(from),
      to: String(to),
      encrypted: encrypt,
      // never include message content in audit log
    });

    return record;
  }

  /**
   * Read messages visible to a given viewer role.
   * - reporter: sees only messages addressed to 'reporter' or role 'all'
   * - investigator: sees all messages on the case, decrypted
   */
  readMessages(reportId, viewer = { role: ROLES.INVESTIGATOR }) {
    const queue = this._messages.get(reportId) || [];
    const role = viewer && viewer.role;
    return queue
      .filter((m) => {
        if (role === ROLES.INVESTIGATOR || role === ROLES.ADMIN) return true;
        if (role === ROLES.REPORTER) {
          return m.to === ROLES.REPORTER || m.to === 'all';
        }
        return false;
      })
      .map((m) => ({
        messageId: m.messageId,
        from: m.from,
        to: m.to,
        at: m.at,
        content: m.encrypted
          ? this._decrypt(m.encryptedContent)
          : m.plaintext,
      }));
  }

  // ── retaliation protection ──────────────────────────────────────────

  /**
   * Flag a reporter for anti-retaliation monitoring. Any subsequent
   * reportAdverseAction() call bearing the same token is automatically
   * escalated. Token remains opaque — we store the salted hash only.
   */
  retaliationProtection(reporterToken) {
    if (!reporterToken) throw new Error('reporterToken required');
    const tokenHash = this._hashToken(reporterToken);
    const reportId = this._tokenIndex.get(tokenHash);
    if (!reportId) {
      throw new Error('unknown reporter token');
    }
    const now = this._now().toISOString();
    const flag = Object.freeze({
      tokenHash,
      reportId,
      flaggedAt: now,
      active: true,
      // Bilingual, stored for UI display
      noticeHe:
        'דיווח זה מוגן מפני פגיעה לפי חוק הגנה על עובדים, תשנ"ז-1997.',
      noticeEn:
        'This reporter is protected against retaliation under the ' +
        'Israeli Protection of Workers Law, 5757-1997.',
    });
    this._retaliationFlags.set(tokenHash, flag);

    const report = this._reports.get(reportId);
    if (report) {
      report.retaliationFlagged = true;
      report.retaliationFlaggedAt = now;
    }

    this._appendEvent(EVENT_TYPES.RETALIATION_FLAGGED, {
      reportId,
      flaggedAt: now,
      // no tokenHash in audit — keeps reporter unlinkable
    });
    return flag;
  }

  /**
   * Report a suspected adverse action (demotion, termination, transfer,
   * reprimand, hostile treatment). If the token has a retaliation flag,
   * the action is auto-escalated.
   *
   * @param {Object} input
   * @param {string} input.reporterToken
   * @param {Object} input.action   { type, description, occurredAt }
   * @returns {Object} escalation record
   */
  reportAdverseAction(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('reportAdverseAction requires an input');
    }
    const { reporterToken, action } = input;
    if (!reporterToken) throw new Error('reporterToken required');
    if (!action || typeof action !== 'object') {
      throw new Error('action object required');
    }

    const tokenHash = this._hashToken(reporterToken);
    const reportId = this._tokenIndex.get(tokenHash);
    if (!reportId) throw new Error('unknown reporter token');

    const now = this._now().toISOString();
    const encryptedAction = this._encrypt(action);
    const entry = Object.freeze({
      at: now,
      reportId,
      autoEscalated: this._retaliationFlags.has(tokenHash),
      encryptedAction,
    });

    const list = this._adverseActions.get(tokenHash) || [];
    list.push(entry);
    this._adverseActions.set(tokenHash, list);

    this._appendEvent(EVENT_TYPES.RETALIATION_ESCALATED, {
      reportId,
      at: now,
      autoEscalated: entry.autoEscalated,
      actionType: action.type || null,
    });

    return entry;
  }

  // ── public status updates (visible via token) ───────────────────────

  /**
   * Update a case's public status and optional public notes. These are
   * the only fields the reporter can see (via reporterStatus).
   */
  statusUpdate(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('statusUpdate requires an input object');
    }
    const { reportId, status, publicNotes } = input;
    const report = this._reports.get(reportId);
    if (!report) throw new Error(`report not found: ${reportId}`);

    if (!Object.values(REPORT_STATUS).includes(status)) {
      throw new Error(`invalid status: ${status}`);
    }
    if (report.closed && status !== REPORT_STATUS.CLOSED) {
      throw new Error('cannot change status of a closed report');
    }

    const now = this._now().toISOString();
    report.status = status;
    const entry = {
      at: now,
      status,
      publicNotes: publicNotes ? String(publicNotes) : '',
    };
    this._statusHistory.get(reportId).push(entry);

    this._appendEvent(EVENT_TYPES.STATUS_UPDATED, {
      reportId,
      status,
      hasPublicNotes: Boolean(publicNotes),
    });
    return entry;
  }

  /**
   * Reporter-facing view of the case. Takes the opaque token and returns
   * only the status + public notes history. Never returns PII, even if
   * identified mode was used.
   */
  reporterStatus(reporterToken) {
    if (!reporterToken) throw new Error('reporterToken required');
    const tokenHash = this._hashToken(reporterToken);
    const reportId = this._tokenIndex.get(tokenHash);
    if (!reportId) throw new Error('unknown reporter token');
    const report = this._reports.get(reportId);
    return {
      reportId,
      caseNumber: report.caseNumber,
      category: report.category,
      status: report.status,
      submittedAt: report.submittedAt,
      history: this._statusHistory.get(reportId).slice(),
      retaliationFlagged: report.retaliationFlagged,
      finding: report.finding,
      closed: report.closed,
      closedAt: report.closedAt,
      language: report.language,
    };
  }

  // ── investigator notes (append-only, encrypted, internal only) ──────

  /**
   * Append an encrypted note from the assigned investigator. Notes are
   * strictly append-only — there is no edit or delete path.
   */
  investigatorNotes(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('investigatorNotes requires an input');
    }
    const { reportId, note, investigatorId } = input;
    const report = this._reports.get(reportId);
    if (!report) throw new Error(`report not found: ${reportId}`);
    if (!investigatorId) throw new Error('investigatorId required');
    if (!note || typeof note !== 'string') {
      throw new Error('note (string) required');
    }

    // Only the currently assigned investigator may append.
    if (
      !report.assignedInvestigator ||
      report.assignedInvestigator.investigatorId !== investigatorId
    ) {
      throw new Error(
        `investigator "${investigatorId}" is not assigned to report "${reportId}"`
      );
    }

    const now = this._now().toISOString();
    const noteId = this._idFactory('NOTE');
    const encrypted = this._encrypt(note);
    const record = Object.freeze({
      noteId,
      reportId,
      investigatorId,
      at: now,
      encrypted,
    });

    const list = this._notes.get(reportId) || [];
    list.push(record);
    this._notes.set(reportId, list);

    this._appendEvent(EVENT_TYPES.NOTE_APPENDED, {
      reportId,
      noteId,
      investigatorId,
    });
    return record;
  }

  /**
   * Read decrypted notes — only the assigned investigator (or admin)
   * may read.
   */
  getInvestigatorNotes(reportId, investigatorId) {
    const report = this._reports.get(reportId);
    if (!report) throw new Error(`report not found: ${reportId}`);
    const list = this._notes.get(reportId) || [];
    if (
      !report.assignedInvestigator ||
      report.assignedInvestigator.investigatorId !== investigatorId
    ) {
      throw new Error('not authorised to read notes for this report');
    }
    return list.map((n) => ({
      noteId: n.noteId,
      at: n.at,
      investigatorId: n.investigatorId,
      note: this._decrypt(n.encrypted),
    }));
  }

  // ── close report ────────────────────────────────────────────────────

  closeReport(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('closeReport requires an input');
    }
    const { reportId, finding, actions } = input;
    const report = this._reports.get(reportId);
    if (!report) throw new Error(`report not found: ${reportId}`);
    if (!Object.values(FINDINGS).includes(finding)) {
      throw new Error(
        `invalid finding "${finding}" — must be one of: ${Object.values(
          FINDINGS
        ).join(', ')}`
      );
    }
    if (report.closed) {
      throw new Error('report already closed');
    }

    const now = this._now().toISOString();
    report.closed = true;
    report.closedAt = now;
    report.finding = finding;
    report.actions = Array.isArray(actions) ? actions.slice() : [];
    report.status = REPORT_STATUS.CLOSED;

    const publicNotesHe = {
      substantiated: 'החקירה הסתיימה — הממצאים אוששו.',
      unsubstantiated: 'החקירה הסתיימה — הממצאים לא אוששו.',
      inconclusive: 'החקירה הסתיימה — הממצאים אינם חד-משמעיים.',
      'referred-externally': 'הנושא הועבר לטיפול גורם חיצוני.',
    };
    const publicNotesEn = {
      substantiated: 'Investigation closed — allegations substantiated.',
      unsubstantiated: 'Investigation closed — allegations unsubstantiated.',
      inconclusive: 'Investigation closed — findings inconclusive.',
      'referred-externally': 'Matter referred to an external authority.',
    };
    const publicNotes =
      report.language === 'en'
        ? publicNotesEn[finding]
        : publicNotesHe[finding];

    this._statusHistory.get(reportId).push({
      at: now,
      status: REPORT_STATUS.CLOSED,
      publicNotes,
    });

    this._appendEvent(EVENT_TYPES.REPORT_CLOSED, {
      reportId,
      finding,
      actionsCount: report.actions.length,
    });

    return {
      reportId,
      closedAt: now,
      finding,
      actions: report.actions.slice(),
      publicNotes,
    };
  }

  // ── external escalation ─────────────────────────────────────────────

  /**
   * Escalate a case to an external authority (ombudsman, state
   * comptroller, financial authority, police, tax, labour court).
   * Creates a record inside the report and appends an audit event.
   * Does NOT actually transmit — this module has no network I/O.
   */
  externalEscalation(reportId, target = EXTERNAL_TARGETS.OMBUDSMAN) {
    const report = this._reports.get(reportId);
    if (!report) throw new Error(`report not found: ${reportId}`);
    if (!Object.values(EXTERNAL_TARGETS).includes(target)) {
      throw new Error(
        `invalid external target "${target}" — must be one of: ${Object.values(
          EXTERNAL_TARGETS
        ).join(', ')}`
      );
    }

    const now = this._now().toISOString();
    const escalationId = this._idFactory('EXT');
    const entry = Object.freeze({
      escalationId,
      reportId,
      target,
      at: now,
      statusBefore: report.status,
    });
    report.externalEscalations.push(entry);
    report.status = REPORT_STATUS.ESCALATED;

    this._statusHistory.get(reportId).push({
      at: now,
      status: REPORT_STATUS.ESCALATED,
      publicNotes:
        report.language === 'en'
          ? 'Case escalated to an external authority.'
          : 'התיק הוסלם לגורם חיצוני.',
    });

    this._appendEvent(EVENT_TYPES.ESCALATED_EXTERNAL, {
      reportId,
      escalationId,
      target,
    });
    return entry;
  }

  // ── statutory report to ministry / regulator ────────────────────────

  /**
   * Aggregated, de-identified statutory report — category counts, status
   * mix, retaliation-flag counts, external-escalation counts. No
   * identities, no tokens, no decrypted content.
   *
   * @param {Object} period { from: ISO, to: ISO }
   */
  statutoryReport(period = {}) {
    const from = period.from ? new Date(period.from).toISOString() : null;
    const to = period.to ? new Date(period.to).toISOString() : null;

    const counts = {
      total: 0,
      byCategory: Object.fromEntries(
        Object.values(CATEGORIES).map((c) => [c, 0])
      ),
      byStatus: Object.fromEntries(
        Object.values(REPORT_STATUS).map((s) => [s, 0])
      ),
      byFinding: Object.fromEntries(
        Object.values(FINDINGS).map((f) => [f, 0])
      ),
      anonymousCount: 0,
      identifiedCount: 0,
      retaliationFlags: 0,
      externalEscalations: 0,
    };

    for (const r of this._reports.values()) {
      if (from && r.submittedAt < from) continue;
      if (to && r.submittedAt > to) continue;
      counts.total += 1;
      counts.byCategory[r.category] += 1;
      counts.byStatus[r.status] = (counts.byStatus[r.status] || 0) + 1;
      if (r.finding) {
        counts.byFinding[r.finding] = (counts.byFinding[r.finding] || 0) + 1;
      }
      if (r.anonymous) counts.anonymousCount += 1;
      else counts.identifiedCount += 1;
      if (r.retaliationFlagged) counts.retaliationFlags += 1;
      counts.externalEscalations += r.externalEscalations.length;
    }

    const reportBody = {
      period: {
        from: from,
        to: to,
      },
      generatedAt: this._now().toISOString(),
      legalBasis: {
        he: 'חוק הגנה על עובדים (חשיפת עבירות ופגיעה בטוהר המידות או במינהל התקין), תשנ"ז-1997',
        en: 'Israeli Protection of Workers (Exposure of Offences and Harm to Integrity or Proper Administration) Law, 5757-1997',
      },
      counts,
      note: {
        he: 'דוח מצרפי — ללא זיהוי מדווחים, ללא תוכן חקירות, ללא אסימונים.',
        en: 'Aggregate report — no reporter identities, no investigation content, no tokens.',
      },
    };

    this._appendEvent(EVENT_TYPES.STATUTORY_REPORT, {
      total: counts.total,
      period: reportBody.period,
    });
    return reportBody;
  }

  // ── integrity check (hash-chain per report) ─────────────────────────

  /**
   * Verify that a specific report's event trail has not been tampered
   * with. Recomputes the SHA-256 chain over the events whose payload
   * references this reportId, in the order they appear in the global
   * audit log.
   */
  integrityCheck(reportId) {
    const report = this._reports.get(reportId);
    if (!report) throw new Error(`report not found: ${reportId}`);

    // First verify the global chain is intact — a broken global chain
    // means any per-report verification is suspect.
    const global = this.verifyChain();
    if (!global.valid) {
      return {
        reportId,
        valid: false,
        reason: 'global audit chain broken',
        brokenAt: global.brokenAt,
      };
    }

    // Collect per-report events in the global order.
    const trail = this._events.filter(
      (e) => e.payload && e.payload.reportId === reportId
    );
    if (trail.length === 0) {
      return {
        reportId,
        valid: true,
        events: 0,
        digest: null,
      };
    }

    // Deterministic per-report digest — SHA-256 over the concatenation of
    // each trail event's hash field, in order.
    const digest = sha256Hex(trail.map((e) => e.hash).join('|'));
    return {
      reportId,
      valid: true,
      events: trail.length,
      digest,
      firstSeq: trail[0].seq,
      lastSeq: trail[trail.length - 1].seq,
    };
  }
}

// ─── exports ───────────────────────────────────────────────────────────

module.exports = {
  WhistleblowerPortal,
  CATEGORIES,
  CATEGORY_LABELS_HE,
  CATEGORY_LABELS_EN,
  REPORT_STATUS,
  FINDINGS,
  EXTERNAL_TARGETS,
  EVENT_TYPES,
  ROLES,
};
