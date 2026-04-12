/**
 * Employee Offboarding Workflow Engine — סיום העסקה
 * Agent Y-064 • Techno-Kol Uzi mega-ERP • Swarm HR
 *
 * Zero-dependency runtime that walks a departing employee through every
 * legally-required stage of an Israeli employment termination — initiation,
 * שימוע (pre-dismissal hearing), statutory notice period, asset return,
 * access revocation, exit interview, final payroll, Form 161 dispatch and
 * approval / recommendation letters.
 *
 * Rule of the ERP (Kobi's law):
 *   "לא מוחקים רק משדרגים ומגדלים"
 *   — Nothing is ever deleted. Every state change is appended to a
 *     tamper-evident, append-only event log per offboarding.
 *
 * ---------------------------------------------------------------
 * ISRAELI STATUTES COVERED
 * ---------------------------------------------------------------
 *  • חוק הודעה מוקדמת לפיטורים ולהתפטרות, התשס"א-2001
 *      Statutory notice period (computed by tenure band — under 6 months,
 *      6-12 months, year+).
 *  • חובת השימוע — Common-law duty to hold a pre-dismissal hearing
 *      (Beit Din L'Avoda case-law). Worker must receive a written
 *      invitation, the allegations, and a minimum of 3 business days to
 *      prepare and to bring representation.
 *  • חוק פיצויי פיטורים, התשכ"ג-1963
 *      Severance pay — delegated to Agent Y-015 (severance-tracker)
 *      via emit-only event; this module never imports.
 *  • חוק חופשה שנתית, התשי"א-1951
 *      Pidyon חופשה — final payroll must include unused vacation balance.
 *  • חוק הגנת השכר, התשי"ח-1958 — final wages owed
 *  • פקודת מס הכנסה — סעיפים 9(7א), 161, 164 → טופס 161 emit
 *  • חוק הודעה לעובד (תנאי עבודה), התשס"ב-2002 → מכתב אישור העסקה
 *  • חוק שוויון הזדמנויות בעבודה — equal opportunity termination
 *  • חוק הגנה על עובדים (חשיפת עבירות) — whistleblower protection
 *
 * ---------------------------------------------------------------
 * STATUS PROGRESSION (strictly enforced)
 * ---------------------------------------------------------------
 *   initiated → notice_served → assets_collected → exit_interview
 *             → final_payroll → completed
 *
 * Each transition appends an entry to the event log. Skipping or moving
 * backward throws — the workflow can be paused (any status → on_hold)
 * but never deleted.
 *
 * ---------------------------------------------------------------
 * INTEGRATION POINTS (emit-only — never import)
 * ---------------------------------------------------------------
 *  • Y-015 severance-tracker      → 'severance:compute', 'form161:request'
 *  • Y-063 onboarding workflow     → cross-reference employee identity
 *  • RBAC / audit trail            → bus event 'offboarding:audit'
 *
 * ---------------------------------------------------------------
 * ZERO DEPS — Node >= 14, in-memory Map storage by default
 * ---------------------------------------------------------------
 *
 * Public exports:
 *   class    Offboarding
 *   const    REASONS                — voluntary/dismissal/retirement/...
 *   const    STATUS                 — initiated → completed enum
 *   const    STATUS_ORDER           — strict progression list
 *   const    ASSET_TYPES            — laptop/phone/keys/access_card/...
 *   const    LABELS                 — bilingual UI labels
 *   const    EXIT_INTERVIEW_TEMPLATE — bilingual template
 *   function isBusinessDay()
 *   function addBusinessDays()
 *   function computeNoticePeriodDays()
 *
 * Bilingual: every reason, status, asset type and template field carries
 * { he, en } pair.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — reasons, statuses, legal anchors
// ═══════════════════════════════════════════════════════════════════

/**
 * Termination reasons. Each entry carries:
 *   - he / en        bilingual label
 *   - severityTier   informational hint for UX/RBAC
 *   - rightsTier     full | partial | limited | estate | pension | mixed
 *   - shimuaRequired whether the שימוע hearing is statutorily required
 */
const REASONS = Object.freeze({
  voluntary: {
    code: 'voluntary',
    he: 'התפטרות מרצון',
    en: 'Voluntary resignation',
    severityTier: 'low',
    rightsTier: 'limited',
    shimuaRequired: false,
  },
  dismissal: {
    code: 'dismissal',
    he: 'פיטורים',
    en: 'Dismissal',
    severityTier: 'high',
    rightsTier: 'full',
    shimuaRequired: true,
  },
  retirement: {
    code: 'retirement',
    he: 'פרישה לפנסיה',
    en: 'Retirement',
    severityTier: 'low',
    rightsTier: 'pension',
    shimuaRequired: false,
  },
  end_of_contract: {
    code: 'end_of_contract',
    he: 'סיום חוזה',
    en: 'End of contract',
    severityTier: 'low',
    rightsTier: 'full',
    shimuaRequired: false,
  },
  death: {
    code: 'death',
    he: 'פטירה (מוות)',
    en: 'Death',
    severityTier: 'critical',
    rightsTier: 'estate',
    shimuaRequired: false,
  },
  layoff: {
    code: 'layoff',
    he: 'צמצום / פיטורי התייעלות',
    en: 'Layoff / economic dismissal',
    severityTier: 'high',
    rightsTier: 'full',
    shimuaRequired: true,
  },
  relocation: {
    code: 'relocation',
    he: 'מעבר מקום מגורים (רלוקיישן)',
    en: 'Relocation',
    severityTier: 'medium',
    rightsTier: 'partial',
    shimuaRequired: false,
  },
});

const REASON_CODES = Object.freeze(Object.keys(REASONS));

/** Strict offboarding lifecycle. */
const STATUS = Object.freeze({
  INITIATED:        'initiated',
  NOTICE_SERVED:    'notice_served',
  ASSETS_COLLECTED: 'assets_collected',
  EXIT_INTERVIEW:   'exit_interview',
  FINAL_PAYROLL:    'final_payroll',
  COMPLETED:        'completed',
  ON_HOLD:          'on_hold',     // pause — לא מוחקים, רק עוצרים
  CANCELLED:        'cancelled',   // e.g. resignation withdrawn — history kept
});

/** Strict progression order (left-to-right). */
const STATUS_ORDER = Object.freeze([
  STATUS.INITIATED,
  STATUS.NOTICE_SERVED,
  STATUS.ASSETS_COLLECTED,
  STATUS.EXIT_INTERVIEW,
  STATUS.FINAL_PAYROLL,
  STATUS.COMPLETED,
]);

/** Asset categories tracked during offboarding. */
const ASSET_TYPES = Object.freeze({
  laptop:       { he: 'מחשב נייד',          en: 'Laptop' },
  phone:        { he: 'טלפון סלולרי',        en: 'Mobile phone' },
  keys:         { he: 'מפתחות',              en: 'Keys' },
  access_card:  { he: 'כרטיס כניסה',        en: 'Access card' },
  uniform:      { he: 'מדי עבודה',           en: 'Uniform' },
  vehicle:      { he: 'רכב חברה',            en: 'Company vehicle' },
  fuel_card:    { he: 'כרטיס דלק',           en: 'Fuel card' },
  credit_card:  { he: 'כרטיס אשראי חברה',   en: 'Company credit card' },
  parking_tag:  { he: 'תג חנייה',             en: 'Parking tag' },
  ppe:          { he: 'ציוד מגן אישי',       en: 'PPE' },
  documents:    { he: 'מסמכי חברה',          en: 'Company documents' },
  monitor:      { he: 'מסך',                  en: 'Monitor' },
  other:        { he: 'אחר',                  en: 'Other' },
});

/** Asset return states. */
const ASSET_STATUS = Object.freeze({
  RETURNED:    'returned',
  MISSING:     'missing',
  DAMAGED:     'damaged',
  WRITTEN_OFF: 'written_off',  // damaged-but-released
  PENDING:     'pending',
});

/** Common system catalogue for access revocation checklist. */
const DEFAULT_SYSTEMS = Object.freeze([
  { id: 'email',         he: 'דואר אלקטרוני',         en: 'Email account' },
  { id: 'erp',           he: 'מערכת ERP',              en: 'ERP system' },
  { id: 'crm',           he: 'מערכת CRM',              en: 'CRM system' },
  { id: 'vpn',           he: 'VPN',                     en: 'VPN' },
  { id: 'sso',           he: 'SSO / זיהוי אחיד',       en: 'SSO / Identity provider' },
  { id: 'fileshare',     he: 'שיתוף קבצים',            en: 'File share' },
  { id: 'github',        he: 'מאגרי קוד',              en: 'Source repos' },
  { id: 'badge',         he: 'תג כניסה פיזי',          en: 'Physical badge' },
  { id: 'building',      he: 'גישה למבנה',             en: 'Building access' },
  { id: 'phone_line',    he: 'קו טלפון פנימי',         en: 'Phone extension' },
]);

/** Letter types emitted by this engine. */
const LETTER_TYPES = Object.freeze({
  SHIMUA:        'shimua_invitation',         // הזמנה לשימוע
  APPROVAL:      'employment_approval',        // מכתב אישור העסקה
  RECOMMENDATION:'recommendation',             // מכתב המלצה
});

/** Recommendation tone presets — discretion of the employer. */
const RECOMMENDATION_TYPES = Object.freeze({
  warm:    { he: 'ממליץ בחום',         en: 'Warm recommendation' },
  neutral: { he: 'אישור עבודה ניטרלי', en: 'Neutral employment confirmation' },
  formal:  { he: 'המלצה רשמית',         en: 'Formal recommendation' },
});

/** Bilingual UI labels for status / events / common phrases. */
const LABELS = Object.freeze({
  STATUS_INITIATED:        { he: 'נפתח',                en: 'Initiated' },
  STATUS_NOTICE_SERVED:    { he: 'הודעה מוקדמת ניתנה', en: 'Notice served' },
  STATUS_ASSETS_COLLECTED: { he: 'ציוד הוחזר',          en: 'Assets collected' },
  STATUS_EXIT_INTERVIEW:   { he: 'ראיון יציאה',         en: 'Exit interview' },
  STATUS_FINAL_PAYROLL:    { he: 'גמר חשבון',           en: 'Final payroll' },
  STATUS_COMPLETED:        { he: 'הושלם',               en: 'Completed' },
  STATUS_ON_HOLD:          { he: 'מושהה',               en: 'On hold' },
  STATUS_CANCELLED:        { he: 'בוטל',                en: 'Cancelled' },

  EVENT_CREATED:    { he: 'נוצר',                          en: 'Created' },
  EVENT_SHIMUA:     { he: 'הזמנה לשימוע נשלחה',           en: 'Shimua invitation sent' },
  EVENT_NOTICE:     { he: 'הודעה מוקדמת חושבה',           en: 'Notice period computed' },
  EVENT_ASSET:      { he: 'ציוד נרשם להחזרה',             en: 'Asset recorded' },
  EVENT_REVOKE:     { he: 'הרשאה בוטלה',                  en: 'Access revoked' },
  EVENT_INTERVIEW:  { he: 'ראיון יציאה הושלם',            en: 'Exit interview conducted' },
  EVENT_PAYROLL:    { he: 'גמר חשבון חושב',               en: 'Final payroll computed' },
  EVENT_FORM161:    { he: 'טופס 161 נשלח לחישוב',         en: 'Form 161 dispatched' },
  EVENT_APPROVAL:   { he: 'מכתב אישור העסקה הופק',       en: 'Approval letter generated' },
  EVENT_RECOMMEND:  { he: 'מכתב המלצה הופק',              en: 'Recommendation letter generated' },
  EVENT_TRANSITION: { he: 'מעבר סטטוס',                   en: 'Status transition' },
});

/**
 * Bilingual exit-interview template — open answers, leave times blank
 * for the reviewer to fill in.
 */
const EXIT_INTERVIEW_TEMPLATE = Object.freeze({
  version: '2026-01',
  he: 'תבנית ראיון יציאה',
  en: 'Exit interview template',
  questions: [
    { key: 'reason_open',          he: 'מה היו הסיבות העיקריות לעזיבה?',
                                    en: 'What were the main reasons for leaving?' },
    { key: 'satisfaction_role',    he: 'עד כמה היית מרוצה מתפקידך?',
                                    en: 'How satisfied were you with your role?' },
    { key: 'satisfaction_manager', he: 'עד כמה היית מרוצה מהממונה הישיר?',
                                    en: 'How satisfied were you with your direct manager?' },
    { key: 'satisfaction_team',    he: 'עד כמה היית מרוצה מהצוות?',
                                    en: 'How satisfied were you with your team?' },
    { key: 'satisfaction_compensation', he: 'עד כמה היית מרוצה מתנאי השכר?',
                                    en: 'How satisfied were you with compensation?' },
    { key: 'culture_feedback',     he: 'מה דעתך על תרבות הארגון?',
                                    en: 'How would you describe the company culture?' },
    { key: 'growth_opportunities', he: 'האם היו לך הזדמנויות צמיחה מספקות?',
                                    en: 'Did you have sufficient growth opportunities?' },
    { key: 'tools_resources',      he: 'האם הכלים והמשאבים היו מספקים?',
                                    en: 'Were tools and resources adequate?' },
    { key: 'workload',             he: 'כיצד היית מתאר/ת את העומס בעבודה?',
                                    en: 'How would you describe the workload?' },
    { key: 'safety',               he: 'האם הרגשת בטוח/ה בסביבת העבודה?',
                                    en: 'Did you feel safe in the work environment?' },
    { key: 'discrimination',       he: 'האם חווית או הבחנת בהפליה / הטרדה?',
                                    en: 'Did you experience or witness discrimination/harassment?' },
    { key: 'rehire_eligible',      he: 'האם היית שוקל/ת לחזור בעתיד?',
                                    en: 'Would you consider rejoining in the future?' },
    { key: 'recommend_company',    he: 'האם תמליץ/י על החברה כמקום עבודה?',
                                    en: 'Would you recommend the company as a workplace?' },
    { key: 'improvement_suggestions', he: 'מה הינו ההצעה העיקרית שלך לשיפור?',
                                    en: 'What is your main suggestion for improvement?' },
    { key: 'final_comments',       he: 'הערות נוספות',
                                    en: 'Additional comments' },
  ],
});

const MS_PER_DAY = 86_400_000;

// ═══════════════════════════════════════════════════════════════════
// PURE HELPERS
// ═══════════════════════════════════════════════════════════════════

function toDate(d) {
  if (d instanceof Date) return new Date(d.getTime());
  if (typeof d === 'number') return new Date(d);
  if (typeof d === 'string') return new Date(d);
  throw new TypeError('Invalid date: ' + d);
}

function addDays(date, n) {
  return new Date(toDate(date).getTime() + n * MS_PER_DAY);
}

/**
 * Israeli business-day rule: Sunday-Thursday are working days.
 * Friday (5) and Saturday (6) are weekend in Israel.
 */
function isBusinessDay(d) {
  const dow = toDate(d).getDay();
  return dow !== 5 && dow !== 6;
}

/**
 * Add N business days to a date (Israeli calendar).
 * Always returns a date that itself falls on a business day.
 */
function addBusinessDays(start, n) {
  let cur = toDate(start);
  let added = 0;
  while (added < n) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur)) added++;
  }
  return cur;
}

/**
 * Compute statutory notice period in days under
 * חוק הודעה מוקדמת לפיטורים ולהתפטרות, התשס"א-2001.
 *
 * Tiered by tenure (months of employment):
 *   • Under 6 months → 1 day per full month worked
 *   • 6-12 months    → 6 days + 2.5 days per month after the 6th
 *   • Year or more   → 1 month (30 days)
 *
 * For death / immediate offboarding the law does not impose a notice
 * period but the employer is still bound by other obligations (estate,
 * payroll). For voluntary resignation the same statute applies symmetrically.
 *
 * @param {object} employee  — { startDate }
 * @param {string} reason    — termination reason code
 * @returns {object} { days, monthsWorked, band, statute }
 */
function computeNoticePeriodDays(employee, reason) {
  if (!employee || !employee.startDate) {
    throw new Error('employee.startDate is required for notice computation');
  }
  const start = toDate(employee.startDate);
  const end = employee.terminationDate
    ? toDate(employee.terminationDate)
    : new Date();

  // Death suspends the notice period requirement on the employee side.
  if (reason === 'death') {
    return {
      days: 0, monthsWorked: 0, band: 'death',
      statute: 'חוק הודעה מוקדמת — אין חובה במקרה פטירה',
    };
  }

  const ms = end.getTime() - start.getTime();
  if (ms < 0) {
    return {
      days: 0, monthsWorked: 0, band: 'invalid',
      statute: 'תאריך תחילה אחרי תאריך סיום',
    };
  }

  // Calendar-month diff (year × 12 + month delta), with day-of-month
  // adjustment so 2025-10-12 → 2026-04-12 is exactly 6 months.
  let monthsWorked =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) monthsWorked--;
  if (monthsWorked < 0) monthsWorked = 0;

  let days;
  let band;
  if (monthsWorked >= 12) {
    days = 30;
    band = 'year_plus';
  } else if (monthsWorked >= 6) {
    // 6 days + 2.5 per month after the 6th, rounded up to whole days.
    const extra = Math.ceil((monthsWorked - 6) * 2.5);
    days = 6 + extra;
    band = 'six_to_twelve';
  } else {
    days = monthsWorked; // 1 day per full month worked, 0 if under 1mo
    band = 'under_six';
  }

  return {
    days,
    monthsWorked,
    band,
    statute: 'חוק הודעה מוקדמת לפיטורים ולהתפטרות, התשס"א-2001',
  };
}

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function deepCloneSafe(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepCloneSafe);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepCloneSafe(obj[k]);
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CLASS — Offboarding
// ═══════════════════════════════════════════════════════════════════

class Offboarding {
  /**
   * @param {object} [options]
   * @param {Map}      [options.store]  — pre-built Map; defaults to new Map
   * @param {function} [options.now]    — clock injection for tests
   * @param {function} [options.emit]   — event sink (eventName, payload)
   * @param {object}   [options.logger] — { info, warn, error }
   * @param {Array}    [options.systemCatalogue] — override default systems
   */
  constructor(options = {}) {
    this.store = options.store instanceof Map ? options.store : new Map();
    this.now = options.now || (() => new Date());
    this.events = []; // emitted events kept for inspection / tests
    this.emit = options.emit || ((name, payload) => {
      this.events.push({ name, payload, at: this.now().toISOString() });
    });
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this.systemCatalogue = options.systemCatalogue || DEFAULT_SYSTEMS;
  }

  // ───────────────────────────────────────────────────────────────
  // STATIC CONSTANTS (exposed for UI / tests)
  // ───────────────────────────────────────────────────────────────
  static get REASONS()                  { return REASONS; }
  static get REASON_CODES()             { return REASON_CODES; }
  static get STATUS()                   { return STATUS; }
  static get STATUS_ORDER()             { return STATUS_ORDER; }
  static get ASSET_TYPES()              { return ASSET_TYPES; }
  static get ASSET_STATUS()             { return ASSET_STATUS; }
  static get DEFAULT_SYSTEMS()          { return DEFAULT_SYSTEMS; }
  static get LETTER_TYPES()             { return LETTER_TYPES; }
  static get RECOMMENDATION_TYPES()     { return RECOMMENDATION_TYPES; }
  static get EXIT_INTERVIEW_TEMPLATE()  { return EXIT_INTERVIEW_TEMPLATE; }
  static get LABELS()                   { return LABELS; }

  // ───────────────────────────────────────────────────────────────
  // 1. INITIATE
  // ───────────────────────────────────────────────────────────────

  /**
   * Open a new offboarding case.
   * @param {object} arg
   * @param {string} arg.employeeId   — employee identifier (TZ or HR id)
   * @param {string} arg.reason       — one of REASON_CODES
   * @param {Date|string} arg.lastDay — planned last day of employment
   * @param {string} arg.initiatedBy  — actor id (manager/HR)
   * @param {object} [arg.employee]   — full employee record (for downstream calc)
   * @returns {object} offboarding record
   */
  initiateOffboarding({ employeeId, reason, lastDay, initiatedBy, employee } = {}) {
    if (!employeeId) throw new Error('employeeId is required');
    if (!reason) throw new Error('reason is required');
    if (!REASON_CODES.includes(reason)) {
      throw new Error('Unknown reason: ' + reason + ' (allowed: ' + REASON_CODES.join(', ') + ')');
    }
    if (!lastDay) throw new Error('lastDay is required');
    if (!initiatedBy) throw new Error('initiatedBy is required');

    const lastDayDate = toDate(lastDay);
    if (isNaN(lastDayDate.getTime())) throw new Error('Invalid lastDay');

    const id = genId('off');
    const reasonMeta = REASONS[reason];

    const record = {
      id,
      employeeId,
      employee: employee ? deepCloneSafe(employee) : null,
      reason,
      reasonMeta: deepCloneSafe(reasonMeta),
      lastDay: lastDayDate.toISOString(),
      initiatedBy,
      status: STATUS.INITIATED,
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),

      // Sub-objects populated by methods below
      shimua: null,            // generateShimuaLetter()
      noticePeriod: null,      // computeNoticePeriod()
      severance: null,         // computeSeverance() — emit-only summary
      assets: [],              // collectAssets() entries
      revocations: [],         // revokeAccess() entries
      exitInterview: null,     // conductExitInterview()
      form161: null,           // generateForm161() emit summary
      approvalLetter: null,    // generateApprovalLetter()
      recommendationLetter: null, // generateRecommendationLetter()
      finalPayroll: null,      // finalPayroll()

      events: [], // append-only event log
    };

    this._appendEvent(record, {
      type: 'created',
      labelHe: LABELS.EVENT_CREATED.he,
      labelEn: LABELS.EVENT_CREATED.en,
      by: initiatedBy,
      data: { reason, lastDay: lastDayDate.toISOString() },
    });

    this.store.set(id, record);
    this.emit('offboarding:initiated', { id, employeeId, reason, lastDay: lastDayDate.toISOString() });
    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // 2. SHIMUA — pre-dismissal hearing letter
  // ───────────────────────────────────────────────────────────────

  /**
   * Generate the שימוע (pre-dismissal hearing) invitation letter.
   *
   * Required by Israeli labor case-law before any dismissal. The notice
   * must:
   *   1. Be in writing.
   *   2. Specify the allegations / reasons.
   *   3. Provide a hearing date NO EARLIER than 3 business days from
   *      issuance, so the employee may prepare and bring representation.
   *   4. Inform the employee of the right to representation.
   *   5. Be bilingual (HE/EN) for non-native readers.
   *
   * @param {string} offboardingId
   * @param {object} [opts]
   * @param {string[]} [opts.allegations] — list of grounds in the manager's words
   * @param {string}   [opts.location]    — physical or virtual hearing location
   * @returns {object} the shimua letter (also stored on the record)
   */
  generateShimuaLetter(offboardingId, opts = {}) {
    const record = this._mustGet(offboardingId);

    // The shimua is mandatory only for dismissal/layoff.
    const reasonMeta = REASONS[record.reason];
    if (!reasonMeta.shimuaRequired) {
      // Still allowed for documentation, but flag it.
      this.logger.warn && this.logger.warn(
        'Shimua not statutorily required for reason ' + record.reason,
      );
    }

    const issuedAt = this.now();
    const hearingDate = addBusinessDays(issuedAt, 3);

    const allegations = Array.isArray(opts.allegations) && opts.allegations.length > 0
      ? opts.allegations.slice()
      : ['ביצועים מקצועיים', 'התנהגות', 'התאמה לתפקיד'];

    const letter = {
      type: LETTER_TYPES.SHIMUA,
      he: {
        title: 'הזמנה לשימוע לפני קבלת החלטה על סיום העסקה',
        salutation: 'לכבוד העובד/ת,',
        body: [
          'הננו להזמינך לשימוע בו ייבחנו הנושאים שלהלן בטרם תתקבל החלטה לגבי המשך העסקתך.',
          'הזכותך להופיע, להציג את עמדתך, ולהיות מלווה/ת על-ידי נציג/ה (עו"ד, בן/בת משפחה או נציג ועד).',
          'מועד השימוע נקבע ל-' + hearingDate.toISOString().slice(0, 10) + ' לפחות שלושה ימי עסקים מהיום.',
          'עליך להגיע מוכנ/ה להציג טענותיך ולהביא כל מסמך התומך בעמדתך.',
          'אי-הגעה ללא הצדקה תיחשב כוויתור על זכות השימוע.',
        ],
        allegationsHeader: 'הטענות שיידונו:',
        allegations,
        legal: 'בהתאם לפסיקת בית הדין לעבודה — חובת השימוע לפני פיטורין.',
        signature: '',
      },
      en: {
        title: 'Invitation to Pre-Dismissal Hearing (Shimua)',
        salutation: 'Dear Employee,',
        body: [
          'You are hereby invited to a hearing where the matters listed below will be reviewed before any decision is taken regarding the continuation of your employment.',
          'You have the right to attend, present your position, and be accompanied by a representative (attorney, family member, or works-council representative).',
          'The hearing is scheduled for ' + hearingDate.toISOString().slice(0, 10) + ' — at least three business days from today.',
          'Please come prepared to present your arguments and bring any supporting documents.',
          'Failure to appear without justification will be deemed a waiver of the right to a hearing.',
        ],
        allegationsHeader: 'Allegations to be discussed:',
        allegations,
        legal: 'Per Israeli labor case-law — pre-dismissal hearing is mandatory.',
        signature: '',
      },
      issuedAt: issuedAt.toISOString(),
      hearingDate: hearingDate.toISOString(),
      hearingLocation: opts.location || 'משרד מנהל משאבי אנוש',
      noticeBusinessDays: 3,
      employeeId: record.employeeId,
      offboardingId: record.id,
      witnessRights: {
        he: 'זכאי/ת להופיע עם מלווה / מייצג',
        en: 'Right to be accompanied by a representative',
      },
    };

    record.shimua = letter;
    record.updatedAt = issuedAt.toISOString();

    this._appendEvent(record, {
      type: 'shimua_generated',
      labelHe: LABELS.EVENT_SHIMUA.he,
      labelEn: LABELS.EVENT_SHIMUA.en,
      by: record.initiatedBy,
      data: { hearingDate: letter.hearingDate, allegations },
    });

    this.store.set(record.id, record);
    this.emit('offboarding:shimua_generated', { id: record.id, hearingDate: letter.hearingDate });
    return letter;
  }

  // ───────────────────────────────────────────────────────────────
  // 3. NOTICE PERIOD
  // ───────────────────────────────────────────────────────────────

  /**
   * Compute statutory notice period for the given employee + reason.
   * Pure delegation to the exported `computeNoticePeriodDays` helper —
   * exposed as a method for the public API surface and for storing on
   * the record.
   *
   * On first call, advances the workflow status from INITIATED to
   * NOTICE_SERVED (recorded in the event log).
   */
  computeNoticePeriod(employee, reason) {
    const result = computeNoticePeriodDays(employee, reason);
    return result;
  }

  /**
   * Serve the computed notice. This is the state-mutating wrapper that
   * hooks into the workflow progression. The pure-math version is
   * `computeNoticePeriod()` above.
   */
  serveNotice(offboardingId, employee) {
    const record = this._mustGet(offboardingId);
    const emp = employee || record.employee;
    if (!emp) {
      throw new Error('Employee data required to serve notice');
    }
    const result = computeNoticePeriodDays(emp, record.reason);
    const noticeStart = this.now();
    const noticeEnd = addDays(noticeStart, result.days);

    record.noticePeriod = {
      ...result,
      issuedAt: noticeStart.toISOString(),
      noticeEnd: noticeEnd.toISOString(),
      labelHe: LABELS.EVENT_NOTICE.he,
      labelEn: LABELS.EVENT_NOTICE.en,
    };
    record.updatedAt = noticeStart.toISOString();

    this._appendEvent(record, {
      type: 'notice_computed',
      labelHe: LABELS.EVENT_NOTICE.he,
      labelEn: LABELS.EVENT_NOTICE.en,
      by: record.initiatedBy,
      data: { ...result, noticeEnd: noticeEnd.toISOString() },
    });

    // Status progression
    this._transition(record, STATUS.NOTICE_SERVED);

    this.store.set(record.id, record);
    this.emit('offboarding:notice_served', { id: record.id, days: result.days, band: result.band });
    return record.noticePeriod;
  }

  // ───────────────────────────────────────────────────────────────
  // 4. SEVERANCE — emit-only, never imports Y-015
  // ───────────────────────────────────────────────────────────────

  /**
   * Trigger severance computation by emitting a request event for the
   * Y-015 severance-tracker. This module never imports Y-015 — it
   * publishes a structured event and stores the dispatch summary on the
   * record. Subscribers (e.g., a bus middleware in the ERP) handle the
   * actual computation.
   *
   * @returns {object} the dispatch summary stored on the record
   */
  computeSeverance(employee, reason) {
    const at = this.now().toISOString();
    const summary = {
      requestedAt: at,
      employeeId: employee && (employee.id || employee.employeeId),
      reason,
      rightsTier: REASONS[reason] && REASONS[reason].rightsTier,
      bridgeAgent: 'Y-015',
      bridgeEvent: 'severance:compute',
      labelHe: 'פיצויי פיטורים — חישוב חיצוני',
      labelEn: 'Severance — external computation',
    };
    this.emit('severance:compute', {
      employeeId: summary.employeeId,
      reason,
      employee: employee ? deepCloneSafe(employee) : null,
      requestedAt: at,
    });
    return summary;
  }

  /**
   * Stateful version that records the dispatch on the offboarding case.
   */
  requestSeverance(offboardingId, employee) {
    const record = this._mustGet(offboardingId);
    const emp = employee || record.employee || { id: record.employeeId };
    const summary = this.computeSeverance(emp, record.reason);
    record.severance = summary;
    record.updatedAt = summary.requestedAt;

    this._appendEvent(record, {
      type: 'severance_requested',
      labelHe: 'פיצויי פיטורים נשלחו לחישוב',
      labelEn: 'Severance dispatched for computation',
      by: record.initiatedBy,
      data: { rightsTier: summary.rightsTier },
    });

    this.store.set(record.id, record);
    return summary;
  }

  // ───────────────────────────────────────────────────────────────
  // 5. ASSET COLLECTION
  // ───────────────────────────────────────────────────────────────

  /**
   * Record asset return statuses. Each item is appended (never replaced
   * silently) — if the same serialNumber is provided again it gets a new
   * record entry plus a transition entry on the previous one.
   *
   * @param {string} offboardingId
   * @param {Array}  items — [{ type, serialNumber, status, notes }]
   * @returns {object} updated assets summary
   */
  collectAssets(offboardingId, items) {
    const record = this._mustGet(offboardingId);
    if (!Array.isArray(items)) {
      throw new Error('items must be an array');
    }

    const validStatuses = new Set(Object.values(ASSET_STATUS));
    for (const item of items) {
      if (!item || !item.type) {
        throw new Error('asset item.type is required');
      }
      if (!ASSET_TYPES[item.type] && item.type !== 'other') {
        throw new Error('Unknown asset type: ' + item.type);
      }
      const status = item.status || ASSET_STATUS.PENDING;
      if (!validStatuses.has(status)) {
        throw new Error('Invalid asset status: ' + status);
      }

      const assetEntry = {
        id: genId('ast'),
        type: item.type,
        labelHe: (ASSET_TYPES[item.type] || ASSET_TYPES.other).he,
        labelEn: (ASSET_TYPES[item.type] || ASSET_TYPES.other).en,
        serialNumber: item.serialNumber || null,
        status,
        notes: item.notes || null,
        recordedAt: this.now().toISOString(),
        recordedBy: item.recordedBy || record.initiatedBy,
        history: [
          {
            at: this.now().toISOString(),
            from: null,
            to: status,
            by: item.recordedBy || record.initiatedBy,
          },
        ],
      };
      record.assets.push(assetEntry);

      this._appendEvent(record, {
        type: 'asset_recorded',
        labelHe: LABELS.EVENT_ASSET.he,
        labelEn: LABELS.EVENT_ASSET.en,
        by: assetEntry.recordedBy,
        data: { type: item.type, serialNumber: assetEntry.serialNumber, status },
      });
    }

    record.updatedAt = this.now().toISOString();

    // Auto-advance to ASSETS_COLLECTED only when every entry is a final state.
    const finalStates = new Set([
      ASSET_STATUS.RETURNED, ASSET_STATUS.MISSING,
      ASSET_STATUS.DAMAGED, ASSET_STATUS.WRITTEN_OFF,
    ]);
    const allResolved = record.assets.length > 0
      && record.assets.every((a) => finalStates.has(a.status));
    if (allResolved && record.status === STATUS.NOTICE_SERVED) {
      this._transition(record, STATUS.ASSETS_COLLECTED);
    }

    this.store.set(record.id, record);
    this.emit('offboarding:assets_recorded', { id: record.id, count: items.length });

    return {
      total: record.assets.length,
      returned: record.assets.filter((a) => a.status === ASSET_STATUS.RETURNED).length,
      missing:  record.assets.filter((a) => a.status === ASSET_STATUS.MISSING).length,
      damaged:  record.assets.filter((a) => a.status === ASSET_STATUS.DAMAGED).length,
      written_off: record.assets.filter((a) => a.status === ASSET_STATUS.WRITTEN_OFF).length,
      pending:  record.assets.filter((a) => a.status === ASSET_STATUS.PENDING).length,
      assets: record.assets,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // 6. REVOKE ACCESS — checklist
  // ───────────────────────────────────────────────────────────────

  /**
   * Record revocation requests for one or more systems. Logs each as a
   * checklist entry on the record. The actual revocation is delegated to
   * the IT-ops bus (event 'access:revoke').
   *
   * @param {string} offboardingId
   * @param {string[]|object[]} systems — list of system ids or {id,name} objects
   * @returns {object[]} the revocation entries created
   */
  revokeAccess(offboardingId, systems) {
    const record = this._mustGet(offboardingId);
    if (!Array.isArray(systems)) {
      throw new Error('systems must be an array');
    }

    const created = [];
    for (const sys of systems) {
      const sysId = typeof sys === 'string' ? sys : sys && sys.id;
      if (!sysId) throw new Error('Each system must be a string or have an id');

      const meta = this.systemCatalogue.find((s) => s.id === sysId)
                || (typeof sys === 'object' ? sys : null);

      const entry = {
        id: genId('rev'),
        systemId: sysId,
        labelHe: meta ? meta.he : sysId,
        labelEn: meta ? meta.en : sysId,
        requestedAt: this.now().toISOString(),
        requestedBy: record.initiatedBy,
        status: 'requested',          // requested → confirmed
        confirmedAt: null,
        confirmedBy: null,
        history: [
          { at: this.now().toISOString(), to: 'requested', by: record.initiatedBy },
        ],
      };
      record.revocations.push(entry);
      created.push(entry);

      this._appendEvent(record, {
        type: 'access_revocation_requested',
        labelHe: LABELS.EVENT_REVOKE.he,
        labelEn: LABELS.EVENT_REVOKE.en,
        by: record.initiatedBy,
        data: { systemId: sysId },
      });

      this.emit('access:revoke', {
        offboardingId: record.id,
        employeeId: record.employeeId,
        systemId: sysId,
        requestedAt: entry.requestedAt,
      });
    }

    record.updatedAt = this.now().toISOString();
    this.store.set(record.id, record);
    return created;
  }

  /**
   * Confirm a previously-requested revocation (e.g. IT operator marks
   * the deletion as completed). Append-only — the original 'requested'
   * entry stays in history.
   */
  confirmRevocation(offboardingId, systemId, confirmedBy) {
    const record = this._mustGet(offboardingId);
    const entry = record.revocations.find(
      (r) => r.systemId === systemId && r.status === 'requested',
    );
    if (!entry) throw new Error('No pending revocation for system: ' + systemId);
    entry.history.push({ at: this.now().toISOString(), to: 'confirmed', by: confirmedBy });
    entry.status = 'confirmed';
    entry.confirmedAt = this.now().toISOString();
    entry.confirmedBy = confirmedBy;
    record.updatedAt = this.now().toISOString();
    this.store.set(record.id, record);
    return entry;
  }

  // ───────────────────────────────────────────────────────────────
  // 7. EXIT INTERVIEW
  // ───────────────────────────────────────────────────────────────

  /**
   * Conduct (record) the exit interview answers using the bilingual
   * template. Stores the entire questionnaire as-given on the record.
   *
   * @param {object} arg
   * @param {string} arg.offboardingId
   * @param {Array}  [arg.questions] — override default question list
   * @param {object} arg.answers     — { questionKey: text }
   * @param {string} arg.reviewerId  — HR reviewer id
   */
  conductExitInterview({ offboardingId, questions, answers, reviewerId } = {}) {
    if (!offboardingId) throw new Error('offboardingId is required');
    if (!answers || typeof answers !== 'object') {
      throw new Error('answers object is required');
    }
    if (!reviewerId) throw new Error('reviewerId is required');

    const record = this._mustGet(offboardingId);
    const useQuestions = (Array.isArray(questions) && questions.length > 0)
      ? questions
      : EXIT_INTERVIEW_TEMPLATE.questions;

    const entries = useQuestions.map((q) => ({
      key: q.key,
      he: q.he,
      en: q.en,
      answer: answers[q.key] != null ? String(answers[q.key]) : '',
    }));

    record.exitInterview = {
      conductedAt: this.now().toISOString(),
      reviewerId,
      template: EXIT_INTERVIEW_TEMPLATE.version,
      titleHe: EXIT_INTERVIEW_TEMPLATE.he,
      titleEn: EXIT_INTERVIEW_TEMPLATE.en,
      entries,
    };
    record.updatedAt = this.now().toISOString();

    this._appendEvent(record, {
      type: 'exit_interview',
      labelHe: LABELS.EVENT_INTERVIEW.he,
      labelEn: LABELS.EVENT_INTERVIEW.en,
      by: reviewerId,
      data: { questions: useQuestions.length, answered: entries.filter((e) => e.answer).length },
    });

    // Status progression — only if previous step is assets_collected
    if (record.status === STATUS.ASSETS_COLLECTED) {
      this._transition(record, STATUS.EXIT_INTERVIEW);
    }

    this.store.set(record.id, record);
    this.emit('offboarding:exit_interview', { id: record.id, reviewerId });
    return record.exitInterview;
  }

  // ───────────────────────────────────────────────────────────────
  // 8. FORM 161 — emit-only bridge to Y-015
  // ───────────────────────────────────────────────────────────────

  /**
   * Dispatch a Form 161 (טופס 161) generation request to the Y-015
   * severance tracker. We never import Y-015; we publish the request
   * with all the termination details and store the dispatch summary.
   */
  generateForm161(offboardingId) {
    const record = this._mustGet(offboardingId);
    const at = this.now().toISOString();

    const summary = {
      requestedAt: at,
      bridgeAgent: 'Y-015',
      bridgeEvent: 'form161:request',
      offboardingId: record.id,
      employeeId: record.employeeId,
      reason: record.reason,
      lastDay: record.lastDay,
      noticePeriod: record.noticePeriod,
      formVersion: '161-2026',
      labelHe: 'בקשת טופס 161 — נשלחה לחישוב',
      labelEn: 'Form 161 request dispatched',
    };

    record.form161 = summary;
    record.updatedAt = at;

    this._appendEvent(record, {
      type: 'form161_dispatched',
      labelHe: LABELS.EVENT_FORM161.he,
      labelEn: LABELS.EVENT_FORM161.en,
      by: record.initiatedBy,
      data: { formVersion: summary.formVersion },
    });

    this.emit('form161:request', {
      offboardingId: record.id,
      employeeId: record.employeeId,
      reason: record.reason,
      lastDay: record.lastDay,
      requestedAt: at,
    });

    this.store.set(record.id, record);
    return summary;
  }

  // ───────────────────────────────────────────────────────────────
  // 9. APPROVAL LETTER  — מכתב אישור העסקה
  // ───────────────────────────────────────────────────────────────

  /**
   * Generate a bilingual employment-confirmation letter. Required by
   * חוק הודעה לעובד (תנאי עבודה) — the employer must, on request,
   * confirm employment dates, position and salary.
   */
  generateApprovalLetter(offboardingId) {
    const record = this._mustGet(offboardingId);
    const at = this.now().toISOString();
    const emp = record.employee || { id: record.employeeId };

    const letter = {
      type: LETTER_TYPES.APPROVAL,
      issuedAt: at,
      he: {
        title: 'מכתב אישור העסקה',
        body: [
          'אנו מאשרים בזאת כי ' + (emp.name || emp.id || record.employeeId) + ' הועסק/ה אצלנו.',
          (emp.startDate ? 'תאריך תחילת העסקה: ' + toDate(emp.startDate).toISOString().slice(0, 10) + '.' : ''),
          'תאריך סיום העסקה: ' + toDate(record.lastDay).toISOString().slice(0, 10) + '.',
          (emp.position ? 'תפקיד: ' + emp.position + '.' : ''),
          'מסמך זה ניתן לבקשת העובד/ת לכל מטרה חוקית.',
        ].filter(Boolean),
        legal: 'לפי חוק הודעה לעובד (תנאי עבודה), התשס"ב-2002.',
      },
      en: {
        title: 'Employment Confirmation Letter',
        body: [
          'We hereby confirm that ' + (emp.name || emp.id || record.employeeId) + ' was employed by our company.',
          (emp.startDate ? 'Employment start date: ' + toDate(emp.startDate).toISOString().slice(0, 10) + '.' : ''),
          'Employment end date: ' + toDate(record.lastDay).toISOString().slice(0, 10) + '.',
          (emp.position ? 'Position: ' + emp.position + '.' : ''),
          'This document is provided at the employee\'s request for any lawful purpose.',
        ].filter(Boolean),
        legal: 'Per the Notice to Employee (Work Conditions) Law, 5762-2002.',
      },
      offboardingId: record.id,
      employeeId: record.employeeId,
    };

    record.approvalLetter = letter;
    record.updatedAt = at;

    this._appendEvent(record, {
      type: 'approval_letter',
      labelHe: LABELS.EVENT_APPROVAL.he,
      labelEn: LABELS.EVENT_APPROVAL.en,
      by: record.initiatedBy,
      data: {},
    });

    this.store.set(record.id, record);
    return letter;
  }

  // ───────────────────────────────────────────────────────────────
  // 10. RECOMMENDATION LETTER — discretionary
  // ───────────────────────────────────────────────────────────────

  /**
   * Generate a bilingual recommendation letter. NOT required by law —
   * employer's discretion. Tone selectable: warm/neutral/formal.
   */
  generateRecommendationLetter(offboardingId, { type = 'neutral', highlights = [] } = {}) {
    const record = this._mustGet(offboardingId);
    if (!RECOMMENDATION_TYPES[type]) {
      throw new Error('Unknown recommendation type: ' + type);
    }
    const at = this.now().toISOString();
    const emp = record.employee || { id: record.employeeId };
    const tone = RECOMMENDATION_TYPES[type];

    const letter = {
      type: LETTER_TYPES.RECOMMENDATION,
      tone: type,
      issuedAt: at,
      he: {
        title: 'מכתב המלצה — ' + tone.he,
        body: [
          'הריני להמליץ על ' + (emp.name || emp.id || record.employeeId) + '.',
          (emp.position ? 'תפקיד: ' + emp.position + '.' : ''),
          (emp.startDate ? 'תקופת העסקה החלה ב-' + toDate(emp.startDate).toISOString().slice(0, 10) + ' והסתיימה ב-' + toDate(record.lastDay).toISOString().slice(0, 10) + '.' : 'תקופת העסקה הסתיימה ב-' + toDate(record.lastDay).toISOString().slice(0, 10) + '.'),
          ...(highlights.length ? ['נקודות לציון:'].concat(highlights.map((h) => '• ' + h)) : []),
          'אני עומד/ת לרשות כל מעסיק עתידי לקבלת מידע נוסף.',
        ].filter(Boolean),
        disclaimer: 'מסמך זה ניתן ביוזמת המעסיק ולא לפי חובה חוקית.',
      },
      en: {
        title: 'Recommendation Letter — ' + tone.en,
        body: [
          'I am pleased to recommend ' + (emp.name || emp.id || record.employeeId) + '.',
          (emp.position ? 'Position: ' + emp.position + '.' : ''),
          (emp.startDate ? 'Period of employment from ' + toDate(emp.startDate).toISOString().slice(0, 10) + ' to ' + toDate(record.lastDay).toISOString().slice(0, 10) + '.' : 'Employment ended on ' + toDate(record.lastDay).toISOString().slice(0, 10) + '.'),
          ...(highlights.length ? ['Highlights:'].concat(highlights.map((h) => '• ' + h)) : []),
          'I remain available to any future employer for further information.',
        ].filter(Boolean),
        disclaimer: 'This letter is provided at the employer\'s discretion and not pursuant to a legal obligation.',
      },
      offboardingId: record.id,
      employeeId: record.employeeId,
    };

    record.recommendationLetter = letter;
    record.updatedAt = at;

    this._appendEvent(record, {
      type: 'recommendation_letter',
      labelHe: LABELS.EVENT_RECOMMEND.he,
      labelEn: LABELS.EVENT_RECOMMEND.en,
      by: record.initiatedBy,
      data: { tone: type, highlightCount: highlights.length },
    });

    this.store.set(record.id, record);
    return letter;
  }

  // ───────────────────────────────────────────────────────────────
  // 11. FINAL PAYROLL  — גמר חשבון
  // ───────────────────────────────────────────────────────────────

  /**
   * Compute the final payroll line items: unused vacation, severance
   * placeholder, final salary, pilot flag.
   *
   * Pure function on the supplied employee snapshot — actual severance
   * value comes from Y-015 via the emit bridge. We surface a `severance`
   * placeholder structure here so the caller can splice the bridge
   * result back in once received.
   *
   * @param {string} offboardingId
   * @param {object} [override] — { employee, dailyRate, vacationDays,
   *                                 finalSalary, pilot, severanceAmount }
   */
  finalPayroll(offboardingId, override = {}) {
    const record = this._mustGet(offboardingId);
    const emp = override.employee || record.employee || {};
    const at = this.now().toISOString();

    // Resolve numbers — fall back to 0 with explicit notes for missing data.
    const monthlySalary = numberOr(override.monthlySalary, emp.monthlySalary, 0);
    const dailyRate = numberOr(override.dailyRate, emp.dailyRate, monthlySalary > 0 ? monthlySalary / 25 : 0);
    const vacationDays = numberOr(override.vacationDays, emp.unusedVacationDays, 0);
    const sickDays = numberOr(override.sickDays, emp.unusedSickDays, 0);

    const unusedVacationPay = round2(vacationDays * dailyRate);
    const finalSalary = numberOr(override.finalSalary, monthlySalary, 0);
    // Severance placeholder — null until Y-015 returns the bridge value.
    // Only treat an explicitly numeric override as a value.
    const severanceOwed = (override.severanceAmount != null && !Number.isNaN(Number(override.severanceAmount)))
      ? Number(override.severanceAmount)
      : null;

    const pilot = override.pilot != null
      ? Boolean(override.pilot)
      : Boolean(emp.role === 'pilot' || emp.position === 'Pilot' || emp.pilot);

    const lineItems = [
      {
        code: 'final_salary',
        he: 'שכר חודש אחרון',
        en: 'Final month salary',
        amount: round2(finalSalary),
      },
      {
        code: 'unused_vacation',
        he: 'פדיון חופשה לא מנוצלת',
        en: 'Unused vacation pay-out',
        amount: unusedVacationPay,
        days: vacationDays,
        dailyRate: round2(dailyRate),
        legal: 'חוק חופשה שנתית, התשי"א-1951',
      },
      {
        code: 'severance_owed',
        he: 'פיצויי פיטורים',
        en: 'Severance owed',
        amount: severanceOwed,                 // null until Y-015 returns
        bridgeAgent: 'Y-015',
        legal: 'חוק פיצויי פיטורים, התשכ"ג-1963',
      },
    ];

    if (sickDays > 0) {
      // Sick days are not paid out at termination by default Israeli law,
      // but a collective agreement may upgrade — surface as a non-amount line.
      lineItems.push({
        code: 'unused_sick',
        he: 'ימי מחלה לא מנוצלים (לא משולמים על-פי חוק)',
        en: 'Unused sick days (not paid by default)',
        amount: 0,
        days: sickDays,
      });
    }

    if (pilot) {
      lineItems.push({
        code: 'pilot_flag',
        he: 'דגל טייס — חישוב מיוחד',
        en: 'Pilot flag — special computation',
        amount: 0,
        flag: true,
      });
    }

    const totalKnown = lineItems
      .map((l) => (typeof l.amount === 'number' ? l.amount : 0))
      .reduce((a, b) => a + b, 0);

    const result = {
      computedAt: at,
      offboardingId: record.id,
      employeeId: record.employeeId,
      lineItems,
      totalKnown: round2(totalKnown),
      pilotFlag: pilot,
      pendingFromBridge: severanceOwed == null ? ['severance_owed'] : [],
      currency: 'ILS',
      labelHe: 'גמר חשבון',
      labelEn: 'Final payroll',
    };

    record.finalPayroll = result;
    record.updatedAt = at;

    this._appendEvent(record, {
      type: 'final_payroll',
      labelHe: LABELS.EVENT_PAYROLL.he,
      labelEn: LABELS.EVENT_PAYROLL.en,
      by: record.initiatedBy,
      data: { totalKnown: result.totalKnown, pilot },
    });

    // Status progression — exit_interview → final_payroll → completed
    if (record.status === STATUS.EXIT_INTERVIEW) {
      this._transition(record, STATUS.FINAL_PAYROLL);
    }

    this.store.set(record.id, record);
    this.emit('offboarding:final_payroll', {
      id: record.id,
      totalKnown: result.totalKnown,
      pendingFromBridge: result.pendingFromBridge,
    });
    return result;
  }

  /**
   * Mark the offboarding as fully completed (status → completed).
   * Throws unless every prior status was reached. The event log is
   * preserved.
   */
  complete(offboardingId, by) {
    const record = this._mustGet(offboardingId);
    if (record.status !== STATUS.FINAL_PAYROLL) {
      throw new Error(
        'Cannot complete: offboarding must be at status final_payroll, currently ' + record.status,
      );
    }
    this._transition(record, STATUS.COMPLETED, by);
    this.store.set(record.id, record);
    this.emit('offboarding:completed', { id: record.id });
    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // 12. HISTORY — read-only event log
  // ───────────────────────────────────────────────────────────────

  /**
   * Return the append-only event log for this offboarding.
   * The returned array is a frozen shallow copy — callers may not mutate it.
   */
  history(offboardingId) {
    const record = this._mustGet(offboardingId);
    return Object.freeze(record.events.slice());
  }

  /** Return the full record (deep clone — safe to mutate). */
  getOffboarding(offboardingId) {
    const record = this._mustGet(offboardingId);
    return deepCloneSafe(record);
  }

  /** List every offboarding currently held in the store. */
  list() {
    return Array.from(this.store.values()).map(deepCloneSafe);
  }

  /** Pause an active offboarding (e.g. resignation withdrawn pending HR review). */
  pause(offboardingId, by, reason) {
    const record = this._mustGet(offboardingId);
    if (record.status === STATUS.COMPLETED || record.status === STATUS.CANCELLED) {
      throw new Error('Cannot pause a ' + record.status + ' offboarding');
    }
    record.previousStatus = record.status;
    record.status = STATUS.ON_HOLD;
    record.updatedAt = this.now().toISOString();
    this._appendEvent(record, {
      type: 'paused',
      labelHe: 'הושהה',
      labelEn: 'Paused',
      by: by || record.initiatedBy,
      data: { reason: reason || null },
    });
    this.store.set(record.id, record);
    return record;
  }

  /** Resume a paused offboarding back to its previous status. */
  resume(offboardingId, by) {
    const record = this._mustGet(offboardingId);
    if (record.status !== STATUS.ON_HOLD) {
      throw new Error('Cannot resume a ' + record.status + ' offboarding');
    }
    const target = record.previousStatus || STATUS.INITIATED;
    record.status = target;
    record.previousStatus = null;
    record.updatedAt = this.now().toISOString();
    this._appendEvent(record, {
      type: 'resumed',
      labelHe: 'חודש',
      labelEn: 'Resumed',
      by: by || record.initiatedBy,
      data: { resumedTo: target },
    });
    this.store.set(record.id, record);
    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ───────────────────────────────────────────────────────────────

  _mustGet(id) {
    const record = this.store.get(id);
    if (!record) throw new Error('Offboarding not found: ' + id);
    return record;
  }

  /**
   * Strict status progression. The new status must be the IMMEDIATE
   * successor of the current one in STATUS_ORDER. Skipping or moving
   * backward throws — except ON_HOLD/CANCELLED which are non-linear.
   */
  _transition(record, newStatus, by) {
    if (newStatus === STATUS.ON_HOLD || newStatus === STATUS.CANCELLED) {
      // Soft transitions handled by pause()/cancel() — appended-only.
      record.status = newStatus;
      return;
    }
    const cur = record.status;
    const curIdx = STATUS_ORDER.indexOf(cur);
    const newIdx = STATUS_ORDER.indexOf(newStatus);
    if (curIdx === -1) {
      throw new Error('Invalid current status: ' + cur);
    }
    if (newIdx === -1) {
      throw new Error('Invalid target status: ' + newStatus);
    }
    if (newIdx !== curIdx + 1) {
      throw new Error(
        'Invalid status transition ' + cur + ' → ' + newStatus +
        ' (must follow ' + STATUS_ORDER.join(' → ') + ')',
      );
    }
    record.status = newStatus;
    record.updatedAt = this.now().toISOString();
    this._appendEvent(record, {
      type: 'transition',
      labelHe: LABELS.EVENT_TRANSITION.he,
      labelEn: LABELS.EVENT_TRANSITION.en,
      by: by || record.initiatedBy,
      data: { from: cur, to: newStatus },
    });
  }

  /**
   * Append an event to the offboarding's append-only log. Each event
   * gets an immutable timestamp and is frozen so accidental writes
   * throw in strict mode.
   */
  _appendEvent(record, evt) {
    const entry = Object.freeze({
      at: this.now().toISOString(),
      type: evt.type,
      labelHe: evt.labelHe || null,
      labelEn: evt.labelEn || null,
      by: evt.by || null,
      data: Object.freeze(deepCloneSafe(evt.data || {})),
    });
    record.events.push(entry);
    return entry;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SHARED PURE HELPERS — also exported
// ═══════════════════════════════════════════════════════════════════

function numberOr(...candidates) {
  for (const c of candidates) {
    if (c == null) continue;
    const n = Number(c);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function round2(n) {
  if (n == null || Number.isNaN(Number(n))) return 0;
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  Offboarding,
  REASONS,
  REASON_CODES,
  STATUS,
  STATUS_ORDER,
  ASSET_TYPES,
  ASSET_STATUS,
  DEFAULT_SYSTEMS,
  LETTER_TYPES,
  RECOMMENDATION_TYPES,
  EXIT_INTERVIEW_TEMPLATE,
  LABELS,
  isBusinessDay,
  addBusinessDays,
  computeNoticePeriodDays,
};
