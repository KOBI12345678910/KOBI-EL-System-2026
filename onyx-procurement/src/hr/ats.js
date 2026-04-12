/**
 * Applicant Tracking System (ATS) — מערכת מעקב מועמדים
 * Agent Y-061 • Techno-Kol Uzi mega-ERP • Swarm HR
 *
 * Zero-dependency append-only ATS that walks a candidate through every
 * stage of the hiring funnel — requisition, publication, application,
 * screening, interviews, feedback, offer, decision — with full bilingual
 * (Hebrew RTL + English LTR) labeling and built-in protection against
 * the kinds of personal-data tracking that would expose the company
 * to claims under חוק שוויון הזדמנויות בעבודה (Equal Employment
 * Opportunities Law, 1988) and amendments.
 *
 * Rule of the ERP: לא מוחקים רק משדרגים ומגדלים.
 * Nothing is ever deleted. A rejected candidate's record remains, with
 * a status flip and reason trail. A withdrawn requisition keeps every
 * application that was attached. An offer that is later renegotiated
 * keeps every prior offer in history.
 *
 * Anti-discrimination guards (חוק שוויון הזדמנויות בעבודה, 1988):
 *   - No protected-class fields are stored on the candidate record.
 *     The schema simply has no slots for: race, religion, nationality,
 *     country of origin, age, gender (mandatory), sexual orientation,
 *     personal status, parental status, party affiliation, military
 *     reserve duty, disability, medical history, or pregnancy.
 *   - The only optional protected attribute is gender, voluntarily
 *     self-reported and used ONLY in aggregated diversity reports
 *     with k-anonymity (counts <5 are suppressed) — never on a
 *     per-candidate view.
 *   - Blind review (`blindReview=true`) pseudonymizes name, email,
 *     phone, and source on the screening view so reviewers see only
 *     a stable code and the resume content. Real PII is unlocked
 *     only after `screenCandidate()` is called.
 *
 * Bilingual: every requisition, status, channel, interview type, and
 * offer-letter section ships with { he, en } labels so the UI can
 * render Hebrew-RTL or English-LTR freely.
 *
 * Zero deps. Node >= 14. Pure in-memory by default; swap in a `store`
 * adapter for persistence (see constructor).
 *
 * Public exports:
 *   class    ATS
 *   const    REQ_STATUS, CANDIDATE_STATUS, INTERVIEW_TYPES, CHANNELS, STAGES
 *   const    LABELS, COMPETENCIES
 *   function createMemoryStore()
 *   function pseudonymize()
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — statuses, stages, channels
// ═══════════════════════════════════════════════════════════════════

/** Requisition lifecycle — append-only, version bumps on edits */
const REQ_STATUS = Object.freeze({
  DRAFT:      'draft',
  OPEN:       'open',
  PUBLISHED:  'published',
  ON_HOLD:    'on_hold',
  CLOSED:     'closed',
  CANCELLED:  'cancelled', // never delete, history preserved
});

/** Candidate journey stages — funnel order matters */
const STAGES = Object.freeze({
  APPLIED:     'applied',
  SCREENED:    'screened',
  INTERVIEWED: 'interviewed',
  OFFERED:     'offered',
  HIRED:       'hired',
  REJECTED:    'rejected',
  WITHDRAWN:   'withdrawn',
});

/** Stage order used for funnel computation */
const STAGE_ORDER = Object.freeze([
  STAGES.APPLIED,
  STAGES.SCREENED,
  STAGES.INTERVIEWED,
  STAGES.OFFERED,
  STAGES.HIRED,
]);

/** Per-candidate status — orthogonal to stage; tracks decision state */
const CANDIDATE_STATUS = Object.freeze({
  ACTIVE:      'active',
  PENDING:     'pending',
  NEGOTIATING: 'negotiating',
  ACCEPTED:    'accepted',
  DECLINED:    'declined',
  REJECTED:    'rejected',
  WITHDRAWN:   'withdrawn',
});

/** Publication channels */
const CHANNELS = Object.freeze({
  INTERNAL:    'internal',
  LINKEDIN:    'LinkedIn',
  DRUSHIM:     'Drushim',
  ALLJOBS:     'AllJobs',
  CAREER_SITE: 'career_site',
});

const VALID_CHANNELS = Object.freeze(Object.values(CHANNELS));

/** Interview types */
const INTERVIEW_TYPES = Object.freeze({
  PHONE:     'phone',
  ON_SITE:   'on-site',
  TECHNICAL: 'technical',
  PANEL:     'panel',
  FINAL:     'final',
});

const VALID_INTERVIEW_TYPES = Object.freeze(Object.values(INTERVIEW_TYPES));

/** Default competency rubric — 1..5 scale, structured & job-relevant only */
const COMPETENCIES = Object.freeze([
  { key: 'technical',     he: 'מיומנות מקצועית',      en: 'Technical skill' },
  { key: 'communication', he: 'תקשורת',                en: 'Communication' },
  { key: 'problem',       he: 'פתרון בעיות',           en: 'Problem solving' },
  { key: 'teamwork',      he: 'עבודת צוות',            en: 'Teamwork' },
  { key: 'culture',       he: 'התאמה לתרבות הארגון',   en: 'Culture add' },
]);

const COMPETENCY_KEYS = Object.freeze(COMPETENCIES.map((c) => c.key));

const SCORE_MIN = 1;
const SCORE_MAX = 5;

const MS_PER_DAY = 86_400_000;

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS
// ═══════════════════════════════════════════════════════════════════

const LABELS = Object.freeze({
  // Stages
  APPLIED:     { he: 'הוגשה מועמדות',  en: 'Applied' },
  SCREENED:    { he: 'עבר מיון',         en: 'Screened' },
  INTERVIEWED: { he: 'רואיין',           en: 'Interviewed' },
  OFFERED:     { he: 'הוצעה הצעה',      en: 'Offered' },
  HIRED:       { he: 'נקלט',             en: 'Hired' },
  REJECTED:    { he: 'נדחה',             en: 'Rejected' },
  WITHDRAWN:   { he: 'נסוג ביוזמתו',    en: 'Withdrawn' },

  // Requisition statuses
  DRAFT:       { he: 'טיוטה',            en: 'Draft' },
  OPEN:        { he: 'פתוח',             en: 'Open' },
  PUBLISHED:   { he: 'פורסם',            en: 'Published' },
  ON_HOLD:     { he: 'מוקפא',            en: 'On hold' },
  CLOSED:      { he: 'סגור',             en: 'Closed' },
  CANCELLED:   { he: 'בוטל',             en: 'Cancelled' },

  // Channels
  INTERNAL:    { he: 'פנימי',            en: 'Internal' },
  LINKEDIN:    { he: 'לינקדאין',         en: 'LinkedIn' },
  DRUSHIM:     { he: 'דרושים',           en: 'Drushim' },
  ALLJOBS:     { he: 'אול-ג׳ובס',        en: 'AllJobs' },
  CAREER_SITE: { he: 'אתר קריירה',       en: 'Career site' },

  // Interview types
  PHONE:       { he: 'ראיון טלפוני',    en: 'Phone screen' },
  ON_SITE:     { he: 'ראיון פנים-אל-פנים', en: 'On-site interview' },
  TECHNICAL:   { he: 'ראיון טכני',       en: 'Technical interview' },
  PANEL:       { he: 'ראיון פאנל',       en: 'Panel interview' },
  FINAL:       { he: 'ראיון סופי',       en: 'Final interview' },

  // Recommendations
  STRONG_HIRE: { he: 'מומלץ מאוד',       en: 'Strong hire' },
  HIRE:        { he: 'מומלץ',            en: 'Hire' },
  NO_HIRE:     { he: 'לא מומלץ',         en: 'No hire' },
  STRONG_NO:   { he: 'בהחלט לא',         en: 'Strong no hire' },

  // Offer-letter sections
  OFFER_TITLE: {
    he: 'הצעת עבודה רשמית',
    en: 'Formal Offer of Employment',
  },
  OFFER_INTRO: {
    he: 'אנו שמחים להציע לך תפקיד בחברתנו, בכפוף לתנאים המפורטים להלן.',
    en: 'We are pleased to offer you a position with our company, subject to the terms set out below.',
  },
  OFFER_SALARY:    { he: 'שכר חודשי ברוטו', en: 'Gross monthly salary' },
  OFFER_BONUS:     { he: 'מענק חתימה',       en: 'Signing bonus' },
  OFFER_EQUITY:    { he: 'אופציות',           en: 'Equity grant' },
  OFFER_START:     { he: 'תאריך תחילת העסקה', en: 'Start date' },
  OFFER_EEO_NOTE:  {
    he: 'חברתנו פועלת על פי חוק שוויון ההזדמנויות בעבודה, התשמ"ח-1988, ואינה מפלה על רקע מין, גזע, דת, לאום, ארץ מוצא, מצב משפחתי, הורות, נטייה מינית, גיל, השקפה, מפלגה, שירות מילואים, או מוגבלות.',
    en: 'Our company operates in accordance with the Israeli Equal Employment Opportunities Law (1988) and does not discriminate on the basis of sex, race, religion, nationality, country of origin, marital status, parenthood, sexual orientation, age, viewpoint, party, reserve service, or disability.',
  },
});

// ═══════════════════════════════════════════════════════════════════
// PSEUDONYMIZATION — protect blind reviewers
// ═══════════════════════════════════════════════════════════════════

/**
 * Stable, deterministic pseudonym generator.
 * Same email → same code, across the entire ATS instance.
 * Uses sha256 truncated to 8 hex chars for collision-resistant short codes.
 */
function pseudonymize(input, salt = 'techno-kol-ats') {
  const h = crypto
    .createHash('sha256')
    .update(String(salt) + '|' + String(input || ''))
    .digest('hex');
  return 'CAND-' + h.slice(0, 8).toUpperCase();
}

/**
 * Pseudonymize a candidate object for blind review.
 * Strips name, email, phone, source. Keeps resume + cover letter content.
 * Does NOT touch the underlying record — returns a redacted copy.
 */
function blindCopy(candidate) {
  const code = pseudonymize(candidate.email || candidate.id);
  return Object.freeze({
    id:          candidate.id,
    code,
    name:        code, // pseudonymized display name
    email:       null,
    phone:       null,
    source:      null,
    resume:      candidate.resume || '',
    coverLetter: candidate.coverLetter || '',
    blinded:     true,
  });
}

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY STORE — append-only, no delete
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns a fresh in-memory store. Intentionally has no delete/remove/clear
 * methods — לא מוחקים. Counter-style ID generation is provided for callers
 * that want stable monotonic IDs without crypto overhead.
 */
function createMemoryStore() {
  const requisitions = new Map();
  const candidates   = new Map();
  const interviews   = new Map();
  const feedbacks    = new Map();
  const offers       = new Map();
  // events: per-candidate append-only event log
  // shape: Map<candId, Array<{ ts, type, payload }>>
  const events       = new Map();

  let reqSeq = 0;
  let candSeq = 0;
  let intSeq = 0;
  let fbSeq = 0;
  let offSeq = 0;

  return {
    requisitions,
    candidates,
    interviews,
    feedbacks,
    offers,
    events,
    nextReqId() {
      reqSeq += 1;
      return 'req_' + String(reqSeq).padStart(6, '0');
    },
    nextCandId() {
      candSeq += 1;
      return 'cand_' + String(candSeq).padStart(6, '0');
    },
    nextIntId() {
      intSeq += 1;
      return 'int_' + String(intSeq).padStart(6, '0');
    },
    nextFbId() {
      fbSeq += 1;
      return 'fb_' + String(fbSeq).padStart(6, '0');
    },
    nextOffId() {
      offSeq += 1;
      return 'off_' + String(offSeq).padStart(6, '0');
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function isPositiveNumber(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function ensureDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'string' || typeof d === 'number') {
    const x = new Date(d);
    if (!Number.isNaN(x.getTime())) return x;
  }
  return null;
}

function daysBetween(a, b) {
  const da = ensureDate(a);
  const db = ensureDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY);
}

function clone(obj) {
  // Plain JSON clone — no Dates, no functions, no class instances expected
  return JSON.parse(JSON.stringify(obj));
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function formatCurrency(amount, currency = 'ILS') {
  if (!isPositiveNumber(amount)) return '—';
  const symbol = currency === 'ILS' ? '₪' : currency === 'USD' ? '$' : currency + ' ';
  return symbol + Number(amount).toLocaleString('en-US');
}

function formatDate(d) {
  const x = ensureDate(d);
  if (!x) return '—';
  return x.toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════════════════════════════

class ATS {
  constructor(opts = {}) {
    this.now   = typeof opts.now === 'function' ? opts.now : () => new Date();
    this.store = opts.store || createMemoryStore();
    // Salt is per-instance so the same email at two companies won't collide
    this.salt  = opts.salt || 'techno-kol-ats';
  }

  // ─────────────────────────────────────────────────────────────────
  // EVENT LOG — append-only, never mutated
  // ─────────────────────────────────────────────────────────────────
  _appendEvent(candId, type, payload) {
    if (!this.store.events.has(candId)) {
      this.store.events.set(candId, []);
    }
    this.store.events.get(candId).push(
      Object.freeze({
        ts: this.now().toISOString(),
        type,
        payload: payload ? Object.freeze(clone(payload)) : null,
      }),
    );
  }

  /** Read-only event log for a candidate. */
  getEvents(candId) {
    const arr = this.store.events.get(candId);
    return arr ? arr.slice() : [];
  }

  // ─────────────────────────────────────────────────────────────────
  // REQUISITIONS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new requisition. Returns the freshly stored object.
   * Subsequent edits via `editRequisition()` bump the version, never
   * overwrite — version 1 stays in `versions[0]`, etc.
   */
  createRequisition(input = {}) {
    const required = ['title_he', 'title_en', 'department', 'hiringManagerId'];
    const missing  = required.filter((k) => !input[k]);
    if (missing.length) {
      throw new Error('Missing requisition fields: ' + missing.join(', '));
    }

    const id = this.store.nextReqId();
    const opening = ensureDate(input.opening_date) || this.now();
    const target  = ensureDate(input.target_date);

    const v1 = Object.freeze({
      version:         1,
      title_he:        String(input.title_he),
      title_en:        String(input.title_en),
      department:      String(input.department),
      level:           input.level || null,
      grade:           input.grade || null,
      location:        input.location || null,
      hiringManagerId: String(input.hiringManagerId),
      budget:          isPositiveNumber(input.budget) ? input.budget : null,
      opening_date:    opening.toISOString(),
      target_date:     target ? target.toISOString() : null,
      editedAt:        this.now().toISOString(),
      editedBy:        input.createdBy || 'system',
    });

    const req = {
      id,
      status:    REQ_STATUS.OPEN,
      versions:  [v1],
      channels:  [],
      candidates: [],
      createdAt: this.now().toISOString(),
    };
    this.store.requisitions.set(id, req);
    return req;
  }

  /** Edit a requisition — append a new version snapshot, never overwrite v1. */
  editRequisition(reqId, patch = {}, editedBy = 'system') {
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);
    const last = req.versions[req.versions.length - 1];
    const next = Object.freeze({
      ...last,
      ...patch,
      version:  last.version + 1,
      editedAt: this.now().toISOString(),
      editedBy,
    });
    req.versions.push(next);
    return req;
  }

  /** Latest version snapshot helper */
  currentVersion(reqId) {
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);
    return req.versions[req.versions.length - 1];
  }

  /**
   * Publish a requisition to one or more channels. Idempotent — re-publishing
   * the same channel adds a new publication record but does not duplicate the
   * channel name in the channel list.
   */
  publishJob(reqId, channels = []) {
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);
    if (!Array.isArray(channels) || channels.length === 0) {
      throw new Error('publishJob requires a non-empty channels array');
    }
    const invalid = channels.filter((c) => !VALID_CHANNELS.includes(c));
    if (invalid.length) {
      throw new Error('Invalid channels: ' + invalid.join(', '));
    }
    if (req.status === REQ_STATUS.CANCELLED || req.status === REQ_STATUS.CLOSED) {
      throw new Error('Cannot publish a ' + req.status + ' requisition');
    }
    for (const ch of channels) {
      if (!req.channels.includes(ch)) req.channels.push(ch);
    }
    req.status = REQ_STATUS.PUBLISHED;
    req.publishedAt = this.now().toISOString();
    return req;
  }

  // ─────────────────────────────────────────────────────────────────
  // APPLICATIONS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Receive a fresh application. The candidate object is stored in two
   * forms: the raw record (with PII) and a derived blind view that
   * `screenCandidate()` may surface to reviewers when blindReview=true.
   */
  receiveApplication(input = {}) {
    if (!input.reqId) throw new Error('reqId required');
    const req = this.store.requisitions.get(input.reqId);
    if (!req) throw new Error('Requisition not found: ' + input.reqId);
    if (!input.candidate || !input.candidate.email) {
      throw new Error('candidate.email required');
    }
    const c = input.candidate;
    const id = this.store.nextCandId();
    const blindReview = input.blindReview === true;

    const candidate = {
      id,
      reqId:     input.reqId,
      // RAW PII — only readable to staff with explicit unblind permissions
      raw: Object.freeze({
        name:        String(c.name || ''),
        email:       String(c.email),
        phone:       String(c.phone || ''),
        source:      String(c.source || 'unknown'),
      }),
      // Resume is content, not identity — never pseudonymized
      resume:      String(c.resume || ''),
      coverLetter: String(c.coverLetter || ''),
      stage:       STAGES.APPLIED,
      status:      CANDIDATE_STATUS.ACTIVE,
      blindReview,
      pseudonym:   pseudonymize(c.email, this.salt),
      appliedAt:   this.now().toISOString(),
      // Voluntary, optional self-reported gender for aggregate diversity
      // reporting only. Stored on the application, NEVER on the
      // reviewer-visible record. May be undefined.
      _voluntary_gender: c.voluntary_gender || null,
      stageHistory: [
        Object.freeze({
          ts:    this.now().toISOString(),
          stage: STAGES.APPLIED,
          actor: 'system',
        }),
      ],
    };
    this.store.candidates.set(id, candidate);
    req.candidates.push(id);
    this._appendEvent(id, 'application_received', {
      reqId:  input.reqId,
      blind:  blindReview,
      source: candidate.raw.source,
    });
    return candidate;
  }

  /**
   * Return a view of the candidate appropriate for the requested audience.
   * Blind reviewers receive a pseudonymized copy with no PII.
   */
  candidateView(candId, { audience = 'staff' } = {}) {
    const c = this.store.candidates.get(candId);
    if (!c) throw new Error('Candidate not found: ' + candId);

    if (audience === 'reviewer' && c.blindReview) {
      const view = blindCopy({
        id:          c.id,
        email:       c.raw.email,
        resume:      c.resume,
        coverLetter: c.coverLetter,
      });
      // override with stable pseudonym from the original record so it
      // matches across separate views
      return Object.freeze({
        ...view,
        code:  c.pseudonym,
        name:  c.pseudonym,
        stage: c.stage,
      });
    }

    return Object.freeze({
      id:          c.id,
      reqId:       c.reqId,
      name:        c.raw.name,
      email:       c.raw.email,
      phone:       c.raw.phone,
      source:      c.raw.source,
      resume:      c.resume,
      coverLetter: c.coverLetter,
      pseudonym:   c.pseudonym,
      stage:       c.stage,
      status:      c.status,
      appliedAt:   c.appliedAt,
      blindReview: c.blindReview,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // SCREENING
  // ─────────────────────────────────────────────────────────────────

  /**
   * Move a candidate through the screening gate. Append-only — the
   * record receives a screen entry rather than mutating prior decisions.
   */
  screenCandidate(candId, { passed, notes, reviewerId } = {}) {
    const c = this.store.candidates.get(candId);
    if (!c) throw new Error('Candidate not found: ' + candId);
    if (typeof passed !== 'boolean') {
      throw new Error('screenCandidate requires boolean `passed`');
    }
    if (!reviewerId) throw new Error('reviewerId required');

    const decision = Object.freeze({
      ts:        this.now().toISOString(),
      passed,
      notes:     notes || '',
      reviewerId: String(reviewerId),
    });

    if (!c.screenings) c.screenings = [];
    c.screenings.push(decision);

    if (passed) {
      this._transitionStage(c, STAGES.SCREENED, reviewerId);
    } else {
      // Reject in screening stage; record remains
      this._transitionStage(c, STAGES.REJECTED, reviewerId);
      c.status = CANDIDATE_STATUS.REJECTED;
      c.rejection = Object.freeze({
        ts: this.now().toISOString(),
        reason: notes || 'failed_screening',
        stage: STAGES.SCREENED,
        actor: reviewerId,
      });
    }
    this._appendEvent(candId, 'screened', { passed, reviewerId });
    return c;
  }

  _transitionStage(c, nextStage, actor) {
    if (c.stage === nextStage) return;
    c.stage = nextStage;
    c.stageHistory.push(
      Object.freeze({
        ts:    this.now().toISOString(),
        stage: nextStage,
        actor: String(actor || 'system'),
      }),
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // INTERVIEWS
  // ─────────────────────────────────────────────────────────────────

  scheduleInterview({ candId, round, interviewers, date, type } = {}) {
    if (!candId) throw new Error('candId required');
    const c = this.store.candidates.get(candId);
    if (!c) throw new Error('Candidate not found: ' + candId);
    if (!VALID_INTERVIEW_TYPES.includes(type)) {
      throw new Error('Invalid interview type: ' + type);
    }
    const d = ensureDate(date);
    if (!d) throw new Error('Invalid interview date');
    if (!Array.isArray(interviewers) || interviewers.length === 0) {
      throw new Error('At least one interviewer required');
    }

    const id = this.store.nextIntId();
    const interview = Object.freeze({
      id,
      candId,
      reqId: c.reqId,
      round: Number(round) || 1,
      type,
      interviewers: Object.freeze(interviewers.slice()),
      date: d.toISOString(),
      label: LABELS[type.toUpperCase().replace('-', '_')] || { he: type, en: type },
      createdAt: this.now().toISOString(),
    });
    this.store.interviews.set(id, interview);

    // Track interviews on the candidate without overwriting prior entries
    if (!c.interviews) c.interviews = [];
    c.interviews.push(id);

    // Stage transition: applied/screened → interviewed
    if (c.stage === STAGES.APPLIED || c.stage === STAGES.SCREENED) {
      this._transitionStage(c, STAGES.INTERVIEWED, 'scheduler');
    }
    this._appendEvent(candId, 'interview_scheduled', {
      interviewId: id, type, round: interview.round,
    });
    return interview;
  }

  /**
   * Append-only feedback. Scores must be 1..5 across competencies; out-of-range
   * values are rejected to keep the rubric meaningful.
   */
  recordFeedback({ interviewId, reviewerId, scores, notes, recommendation } = {}) {
    if (!interviewId) throw new Error('interviewId required');
    const interview = this.store.interviews.get(interviewId);
    if (!interview) throw new Error('Interview not found: ' + interviewId);
    if (!reviewerId) throw new Error('reviewerId required');
    if (!scores || typeof scores !== 'object') {
      throw new Error('scores object required');
    }

    // Validate score range
    const validatedScores = {};
    for (const key of COMPETENCY_KEYS) {
      const v = scores[key];
      if (v == null) continue;
      if (typeof v !== 'number' || v < SCORE_MIN || v > SCORE_MAX) {
        throw new Error(`Score for ${key} out of range (${SCORE_MIN}-${SCORE_MAX}): ${v}`);
      }
      validatedScores[key] = v;
    }

    const present = Object.values(validatedScores);
    const avg = present.length
      ? Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 100) / 100
      : null;

    const id = this.store.nextFbId();
    const fb = Object.freeze({
      id,
      interviewId,
      candId: interview.candId,
      reviewerId: String(reviewerId),
      scores: Object.freeze(validatedScores),
      averageScore: avg,
      notes: notes || '',
      recommendation: recommendation || null,
      ts: this.now().toISOString(),
    });
    this.store.feedbacks.set(id, fb);

    // Append to candidate aggregate (never overwrite — even if reviewer
    // submits twice, both records are preserved)
    const c = this.store.candidates.get(interview.candId);
    if (c) {
      if (!c.feedbacks) c.feedbacks = [];
      c.feedbacks.push(id);
      this._appendEvent(c.id, 'feedback_recorded', {
        interviewId, reviewerId, avg, recommendation,
      });
    }
    return fb;
  }

  /** Compute the simple per-candidate average across all collected feedback. */
  candidateAverage(candId) {
    const c = this.store.candidates.get(candId);
    if (!c || !c.feedbacks || !c.feedbacks.length) return null;
    const all = c.feedbacks.map((fid) => this.store.feedbacks.get(fid));
    const avgs = all.map((fb) => fb.averageScore).filter((n) => typeof n === 'number');
    if (!avgs.length) return null;
    return Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100;
  }

  // ─────────────────────────────────────────────────────────────────
  // OFFERS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Generate and store a bilingual offer letter. Returns the offer
   * object including the `letter.he` and `letter.en` rendered text.
   */
  makeOffer({ candId, reqId, salary, startDate, signingBonus, equity, currency = 'ILS' } = {}) {
    if (!candId) throw new Error('candId required');
    if (!reqId)  throw new Error('reqId required');
    const c = this.store.candidates.get(candId);
    if (!c) throw new Error('Candidate not found: ' + candId);
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);
    if (!isPositiveNumber(salary)) {
      throw new Error('salary must be a positive number');
    }
    const start = ensureDate(startDate);
    if (!start) throw new Error('Invalid startDate');

    const v = req.versions[req.versions.length - 1];
    const id = this.store.nextOffId();

    // Build bilingual letter text
    const lines_he = [
      LABELS.OFFER_TITLE.he,
      '',
      'שלום ' + c.raw.name + ',',
      '',
      LABELS.OFFER_INTRO.he,
      '',
      '• תפקיד: ' + v.title_he,
      '• מחלקה: ' + v.department,
      '• ' + LABELS.OFFER_SALARY.he + ': ' + formatCurrency(salary, currency),
      '• ' + LABELS.OFFER_START.he + ': ' + formatDate(start),
    ];
    const lines_en = [
      LABELS.OFFER_TITLE.en,
      '',
      'Dear ' + c.raw.name + ',',
      '',
      LABELS.OFFER_INTRO.en,
      '',
      '• Role: ' + v.title_en,
      '• Department: ' + v.department,
      '• ' + LABELS.OFFER_SALARY.en + ': ' + formatCurrency(salary, currency),
      '• ' + LABELS.OFFER_START.en + ': ' + formatDate(start),
    ];
    if (isPositiveNumber(signingBonus)) {
      lines_he.push('• ' + LABELS.OFFER_BONUS.he + ': ' + formatCurrency(signingBonus, currency));
      lines_en.push('• ' + LABELS.OFFER_BONUS.en + ': ' + formatCurrency(signingBonus, currency));
    }
    if (equity) {
      const eq = typeof equity === 'object' && equity.shares
        ? equity.shares + ' shares (' + (equity.vesting || '4y/1y cliff') + ')'
        : String(equity);
      lines_he.push('• ' + LABELS.OFFER_EQUITY.he + ': ' + eq);
      lines_en.push('• ' + LABELS.OFFER_EQUITY.en + ': ' + eq);
    }
    lines_he.push('', LABELS.OFFER_EEO_NOTE.he);
    lines_en.push('', LABELS.OFFER_EEO_NOTE.en);

    const offer = Object.freeze({
      id,
      candId,
      reqId,
      salary,
      currency,
      signingBonus: isPositiveNumber(signingBonus) ? signingBonus : null,
      equity: equity || null,
      startDate: start.toISOString(),
      letter: Object.freeze({
        he: lines_he.join('\n'),
        en: lines_en.join('\n'),
      }),
      createdAt: this.now().toISOString(),
      status: CANDIDATE_STATUS.PENDING,
    });
    this.store.offers.set(id, offer);

    if (!c.offers) c.offers = [];
    c.offers.push(id);
    this._transitionStage(c, STAGES.OFFERED, 'recruiter');
    c.status = CANDIDATE_STATUS.PENDING;
    c.offeredAt = this.now().toISOString();
    this._appendEvent(candId, 'offer_made', { offerId: id, salary, currency });
    return offer;
  }

  /**
   * Record the candidate's decision on the most recent offer. Status
   * transitions ripple to the candidate aggregate and the funnel.
   */
  recordDecision({ candId, status } = {}) {
    if (!candId) throw new Error('candId required');
    const valid = [
      CANDIDATE_STATUS.ACCEPTED,
      CANDIDATE_STATUS.DECLINED,
      CANDIDATE_STATUS.PENDING,
      CANDIDATE_STATUS.NEGOTIATING,
    ];
    if (!valid.includes(status)) {
      throw new Error('Invalid decision status: ' + status);
    }
    const c = this.store.candidates.get(candId);
    if (!c) throw new Error('Candidate not found: ' + candId);
    if (!c.offers || !c.offers.length) {
      throw new Error('Cannot record decision without an offer');
    }
    c.status = status;
    c.decisionAt = this.now().toISOString();
    c.decisionHistory = c.decisionHistory || [];
    c.decisionHistory.push(
      Object.freeze({ ts: this.now().toISOString(), status }),
    );
    if (status === CANDIDATE_STATUS.ACCEPTED) {
      this._transitionStage(c, STAGES.HIRED, 'system');
      c.hiredAt = this.now().toISOString();
    }
    this._appendEvent(candId, 'decision_recorded', { status });
    return c;
  }

  // ─────────────────────────────────────────────────────────────────
  // REJECTION — flip status, never delete
  // ─────────────────────────────────────────────────────────────────

  rejectCandidate({ candId, reason, stage } = {}) {
    if (!candId) throw new Error('candId required');
    const c = this.store.candidates.get(candId);
    if (!c) throw new Error('Candidate not found: ' + candId);
    const r = String(reason || 'unspecified');
    const s = stage || c.stage;
    c.status = CANDIDATE_STATUS.REJECTED;
    c.rejection = Object.freeze({
      ts: this.now().toISOString(),
      reason: r,
      stage: s,
      previousStage: c.stage,
    });
    this._transitionStage(c, STAGES.REJECTED, 'system');
    this._appendEvent(candId, 'rejected', { reason: r, stage: s });
    return c;
  }

  // ─────────────────────────────────────────────────────────────────
  // PIPELINE / FUNNEL
  // ─────────────────────────────────────────────────────────────────

  /**
   * Returns the funnel counts (applied → screened → interviewed →
   * offered → hired) for one requisition. A candidate is counted in
   * every stage they reached, computed from stageHistory so that a
   * later rejection doesn't erase the fact that they were once
   * "interviewed". This is essential for honest funnel metrics.
   */
  pipeline(reqId) {
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);

    const counts = {
      applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0,
      rejected: 0, withdrawn: 0,
    };

    for (const cid of req.candidates) {
      const c = this.store.candidates.get(cid);
      if (!c) continue;
      const stagesReached = new Set(c.stageHistory.map((h) => h.stage));
      if (stagesReached.has(STAGES.APPLIED))     counts.applied += 1;
      if (stagesReached.has(STAGES.SCREENED))    counts.screened += 1;
      if (stagesReached.has(STAGES.INTERVIEWED)) counts.interviewed += 1;
      if (stagesReached.has(STAGES.OFFERED))     counts.offered += 1;
      if (stagesReached.has(STAGES.HIRED))       counts.hired += 1;
      if (c.status === CANDIDATE_STATUS.REJECTED) counts.rejected += 1;
      if (c.status === CANDIDATE_STATUS.WITHDRAWN) counts.withdrawn += 1;
    }

    // Conversion ratios — guard against div/0
    const ratio = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
    return {
      reqId,
      counts,
      conversion: {
        applied_to_screened:    ratio(counts.screened,    counts.applied),
        screened_to_interviewed: ratio(counts.interviewed, counts.screened),
        interviewed_to_offered: ratio(counts.offered,     counts.interviewed),
        offered_to_hired:       ratio(counts.hired,       counts.offered),
      },
      generatedAt: this.now().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // DIVERSITY REPORT — k-anonymous, aggregate only
  // ─────────────────────────────────────────────────────────────────

  /**
   * Aggregate counts only — never per-candidate. The only protected
   * attribute considered is voluntary self-reported gender. Counts
   * smaller than `kAnonymity` (default 5) are suppressed and reported
   * as "<5" so individuals can't be re-identified from the bucket.
   */
  diversityReport(reqId, { kAnonymity = 5 } = {}) {
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);

    const buckets = { female: 0, male: 0, other: 0, unreported: 0 };
    let total = 0;
    for (const cid of req.candidates) {
      const c = this.store.candidates.get(cid);
      if (!c) continue;
      total += 1;
      const g = (c._voluntary_gender || '').toLowerCase();
      if (g === 'female')      buckets.female += 1;
      else if (g === 'male')   buckets.male += 1;
      else if (g === 'other')  buckets.other += 1;
      else                     buckets.unreported += 1;
    }

    const suppress = (n) => (n < kAnonymity ? '<' + kAnonymity : n);
    return {
      reqId,
      total_applications: total,
      voluntary_gender_breakdown: {
        female:    suppress(buckets.female),
        male:      suppress(buckets.male),
        other:     suppress(buckets.other),
        unreported: suppress(buckets.unreported),
      },
      kAnonymity,
      note_he: 'דוח אנונימי בלבד; שדות עם פחות מ' + kAnonymity + ' תצפיות מוסתרים.',
      note_en: 'Aggregate-only report; buckets with fewer than ' + kAnonymity + ' observations are suppressed.',
      generatedAt: this.now().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // TIME TO HIRE
  // ─────────────────────────────────────────────────────────────────

  /**
   * Days from requisition opening to acceptance of the first offer.
   * If no candidate has accepted yet, returns null along with a partial
   * snapshot (median time-in-stage etc).
   */
  timeToHire(reqId) {
    const req = this.store.requisitions.get(reqId);
    if (!req) throw new Error('Requisition not found: ' + reqId);
    const opened = req.versions[0].opening_date;

    let firstAcceptance = null;
    for (const cid of req.candidates) {
      const c = this.store.candidates.get(cid);
      if (!c) continue;
      if (c.status === CANDIDATE_STATUS.ACCEPTED) {
        const ts = c.decisionAt || c.hiredAt;
        if (!firstAcceptance || new Date(ts) < new Date(firstAcceptance)) {
          firstAcceptance = ts;
        }
      }
    }

    return {
      reqId,
      opened,
      firstAcceptance,
      days: firstAcceptance ? daysBetween(opened, firstAcceptance) : null,
      generatedAt: this.now().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // COHORT REPORT — hires aggregated by source/department over a period
  // ─────────────────────────────────────────────────────────────────

  /**
   * Aggregate cohort report. period is { from, to } (inclusive of from,
   * exclusive of to). Returns counts per source and per department.
   */
  cohortReport(period = {}) {
    const from = ensureDate(period.from);
    const to   = ensureDate(period.to) || this.now();
    if (!from) throw new Error('cohortReport requires period.from');

    const bySource = {};
    const byDepartment = {};
    let totalHires = 0;

    for (const c of this.store.candidates.values()) {
      if (c.status !== CANDIDATE_STATUS.ACCEPTED) continue;
      const ts = c.decisionAt || c.hiredAt;
      if (!ts) continue;
      const d = new Date(ts);
      if (d < from || d >= to) continue;
      totalHires += 1;

      const source = c.raw.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;

      const req = this.store.requisitions.get(c.reqId);
      if (req) {
        const v = req.versions[req.versions.length - 1];
        const dept = v.department || 'unknown';
        byDepartment[dept] = (byDepartment[dept] || 0) + 1;
      }
    }

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totalHires,
      bySource,
      byDepartment,
      generatedAt: this.now().toISOString(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  ATS,
  REQ_STATUS,
  CANDIDATE_STATUS,
  STAGES,
  STAGE_ORDER,
  CHANNELS,
  VALID_CHANNELS,
  INTERVIEW_TYPES,
  VALID_INTERVIEW_TYPES,
  COMPETENCIES,
  COMPETENCY_KEYS,
  LABELS,
  SCORE_MIN,
  SCORE_MAX,
  pseudonymize,
  blindCopy,
  createMemoryStore,
};
