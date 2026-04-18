/**
 * Employee Onboarding Workflow Engine — קליטת עובד
 * Agent Y-63 • Techno-Kol Uzi mega-ERP • Swarm HR
 *
 * Zero-dependency pure workflow runtime that walks a new hire through
 * every phase of the Israeli employment lifecycle — pre-boarding, day 1,
 * week 1, month 1, month 3 — with task sequencing, probation reviews,
 * Form 101 (טופס 101) capture, role-based equipment checklists, buddy
 * matching, and overdue-blocker alerting.
 *
 * Rule of the ERP: לא מוחקים רק משדרגים ומגדלים.
 * Nothing is ever deleted. Cancelled or superseded tasks stay in history
 * with a status transition and reason trail.
 *
 * Bilingual: every task, phase, and form field ships with { he, en }
 * labels so the UI can render Hebrew-RTL or English-LTR freely.
 *
 * Zero deps. Node >= 14. Pure in-memory by default; swap in a `store`
 * adapter for persistence (see constructor).
 *
 * Public exports:
 *   class  OnboardingWorkflow
 *   const  PHASES
 *   const  TASK_STATUS
 *   const  FORM_101_FIELDS
 *   const  ROLE_EQUIPMENT
 *   const  LABELS
 *   function createMemoryStore()
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — phases, statuses, legal anchors
// ═══════════════════════════════════════════════════════════════════

/** Onboarding phases in legal/temporal order */
const PHASES = Object.freeze({
  PRE_BOARDING: 'pre_boarding',    // before startDate
  DAY_1:        'day_1',           // on startDate
  WEEK_1:       'week_1',          // startDate .. +7d
  MONTH_1:      'month_1',         // startDate .. +30d
  MONTH_3:      'month_3',         // startDate .. +90d (probation)
});

const PHASE_ORDER = Object.freeze([
  PHASES.PRE_BOARDING,
  PHASES.DAY_1,
  PHASES.WEEK_1,
  PHASES.MONTH_1,
  PHASES.MONTH_3,
]);

/** Task lifecycle — legacy statuses never disappear, only transition */
const TASK_STATUS = Object.freeze({
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  DONE:        'done',
  BLOCKED:     'blocked',
  OVERDUE:     'overdue',
  SKIPPED:     'skipped',   // skip ≠ delete, audit record kept
  CANCELLED:   'cancelled', // cancel ≠ delete, audit record kept
});

/** Onboarding-instance top-level status */
const ONBOARDING_STATUS = Object.freeze({
  ACTIVE:    'active',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',  // e.g. offer withdrawn — history preserved
});

/** Day offsets relative to startDate for each phase. Negative = before. */
const PHASE_OFFSETS_DAYS = Object.freeze({
  [PHASES.PRE_BOARDING]: -7,
  [PHASES.DAY_1]:         0,
  [PHASES.WEEK_1]:        7,
  [PHASES.MONTH_1]:       30,
  [PHASES.MONTH_3]:       90,
});

const MS_PER_DAY = 86_400_000;

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS
// ═══════════════════════════════════════════════════════════════════

const LABELS = Object.freeze({
  // Phases
  PRE_BOARDING:  { he: 'קליטה מוקדמת',     en: 'Pre-boarding' },
  DAY_1:         { he: 'יום ראשון',          en: 'Day 1' },
  WEEK_1:        { he: 'שבוע ראשון',         en: 'Week 1' },
  MONTH_1:       { he: 'חודש ראשון',         en: 'Month 1' },
  MONTH_3:       { he: 'חודש שלישי',         en: 'Month 3 / Probation' },

  // Pre-boarding
  PREP_DESK:     { he: 'הכנת עמדת עבודה',   en: 'Prepare desk / workstation' },
  ORDER_EQUIP:   { he: 'הזמנת ציוד',         en: 'Order equipment' },
  CREATE_ACCTS:  { he: 'פתיחת משתמשים ומערכות', en: 'Create system accounts' },
  WELCOME_EMAIL: { he: 'מייל ברוכים הבאים',  en: 'Send welcome email' },
  ASSIGN_BUDDY:  { he: 'שיבוץ חונך',         en: 'Assign buddy' },

  // Day 1
  WELCOME_MEET:   { he: 'קבלת פנים',          en: 'Welcome meeting' },
  ORIENTATION:    { he: 'הכוונה כללית',       en: 'Orientation' },
  FORM_101:       { he: 'טופס 101',           en: 'Tax form 101' },
  EMPLOY_CONTRACT:{ he: 'חוזה עבודה',         en: 'Employment contract' },
  FORM_SHPAR:     { he: 'טופס השפ"ר',         en: 'Form SHPAR (training fund)' },
  BL_REPORT:      { he: 'דוח קבלת עובד לביטוח לאומי', en: 'Bituah Leumi new hire report' },

  // Week 1
  SYS_ACCESS:      { he: 'הרשאות למערכות',    en: 'Systems access' },
  SAFETY_TRAINING: { he: 'הדרכת בטיחות',      en: 'Safety training' },
  TEAM_INTRO:      { he: 'היכרות עם הצוות',    en: 'Team introduction' },

  // Month 1
  FIRST_ONE_ON_ONE:{ he: 'פגישת 1:1 ראשונה',  en: 'First 1:1 meeting' },
  PROJECT_ASSIGN:  { he: 'שיבוץ לפרויקט',     en: 'Project assignment' },
  TRAINING_PLAN:   { he: 'תכנית הדרכה',       en: 'Training plan' },

  // Month 3
  PROBATION_REVIEW:{ he: 'סקירת תקופת ניסיון', en: 'Probation review' },
  ONGOING_TRAINING:{ he: 'הדרכה מתמשכת',      en: 'Ongoing training' },
});

// ═══════════════════════════════════════════════════════════════════
// TASK TEMPLATES  — (id, phase, labelKey, offsetDays, mandatory, role?)
// ═══════════════════════════════════════════════════════════════════

/**
 * Each template becomes a concrete task when an onboarding is created.
 * `offsetDays` is added to startDate to compute `dueAt` — negative for
 * pre-boarding items.
 */
const TASK_TEMPLATES = Object.freeze([
  // — Pre-boarding (before startDate)
  { id: 'prep_desk',      phase: PHASES.PRE_BOARDING, labelKey: 'PREP_DESK',     offsetDays: -3, mandatory: true  },
  { id: 'order_equip',    phase: PHASES.PRE_BOARDING, labelKey: 'ORDER_EQUIP',   offsetDays: -7, mandatory: true  },
  { id: 'create_accounts',phase: PHASES.PRE_BOARDING, labelKey: 'CREATE_ACCTS',  offsetDays: -2, mandatory: true  },
  { id: 'welcome_email',  phase: PHASES.PRE_BOARDING, labelKey: 'WELCOME_EMAIL', offsetDays: -5, mandatory: true  },
  { id: 'assign_buddy',   phase: PHASES.PRE_BOARDING, labelKey: 'ASSIGN_BUDDY',  offsetDays: -3, mandatory: true  },

  // — Day 1
  { id: 'welcome_meeting',  phase: PHASES.DAY_1, labelKey: 'WELCOME_MEET',    offsetDays: 0, mandatory: true },
  { id: 'orientation',      phase: PHASES.DAY_1, labelKey: 'ORIENTATION',     offsetDays: 0, mandatory: true },
  { id: 'form_101',         phase: PHASES.DAY_1, labelKey: 'FORM_101',        offsetDays: 0, mandatory: true, legal: 'pkuda-164-mas-hahnasa' },
  { id: 'employment_contract', phase: PHASES.DAY_1, labelKey: 'EMPLOY_CONTRACT', offsetDays: 0, mandatory: true, legal: 'hok-hodaa-la-oved-5762-2002' },
  { id: 'form_shpar',       phase: PHASES.DAY_1, labelKey: 'FORM_SHPAR',      offsetDays: 0, mandatory: true, legal: 'keren-histalmut' },
  { id: 'bl_report',        phase: PHASES.DAY_1, labelKey: 'BL_REPORT',       offsetDays: 0, mandatory: true, legal: 'bituah-leumi-new-hire' },

  // — Week 1
  { id: 'systems_access',   phase: PHASES.WEEK_1, labelKey: 'SYS_ACCESS',      offsetDays: 2, mandatory: true },
  { id: 'safety_training',  phase: PHASES.WEEK_1, labelKey: 'SAFETY_TRAINING', offsetDays: 3, mandatory: true, legal: 'takanot-irgun-pikuah-al-haavoda' },
  { id: 'team_intro',       phase: PHASES.WEEK_1, labelKey: 'TEAM_INTRO',      offsetDays: 4, mandatory: false },

  // — Month 1
  { id: 'first_1on1',       phase: PHASES.MONTH_1, labelKey: 'FIRST_ONE_ON_ONE', offsetDays: 14, mandatory: true },
  { id: 'project_assignment',phase: PHASES.MONTH_1, labelKey: 'PROJECT_ASSIGN',  offsetDays: 21, mandatory: true },
  { id: 'training_plan',    phase: PHASES.MONTH_1, labelKey: 'TRAINING_PLAN',    offsetDays: 28, mandatory: true },

  // — Month 3 (probation)
  { id: 'probation_review', phase: PHASES.MONTH_3, labelKey: 'PROBATION_REVIEW', offsetDays: 85, mandatory: true },
  { id: 'ongoing_training', phase: PHASES.MONTH_3, labelKey: 'ONGOING_TRAINING', offsetDays: 90, mandatory: false },
]);

// ═══════════════════════════════════════════════════════════════════
// FORM 101 — טופס 101  (tax withholding declaration, Israel Tax Authority)
// Pakuda 164 — mandatory every year and upon hire for withholding setup
// ═══════════════════════════════════════════════════════════════════

/**
 * Minimal but complete set of fields required by form 101 as of 2026.
 * Each entry: { key, he, en, type, required, section }.
 *
 * Type taxonomy: string, id, date, enum, int, decimal, bool, address.
 */
const FORM_101_FIELDS = Object.freeze([
  // Section A — employee identity (פרטי העובד)
  { key: 'full_name',         section: 'A', he: 'שם מלא',                en: 'Full name',            type: 'string',  required: true  },
  { key: 'tz',                section: 'A', he: 'מספר זהות',              en: 'ID number (TZ)',       type: 'id',      required: true  },
  { key: 'date_of_birth',     section: 'A', he: 'תאריך לידה',             en: 'Date of birth',        type: 'date',    required: true  },
  { key: 'aliyah_date',       section: 'A', he: 'תאריך עלייה',            en: 'Aliyah date (if applicable)', type: 'date', required: false },
  { key: 'country_of_birth',  section: 'A', he: 'ארץ לידה',               en: 'Country of birth',     type: 'string',  required: false },
  { key: 'gender',            section: 'A', he: 'מין',                    en: 'Gender',               type: 'enum',    required: true, options: ['male','female','other'] },
  { key: 'address',           section: 'A', he: 'כתובת מגורים',            en: 'Home address',         type: 'address', required: true  },
  { key: 'phone',             section: 'A', he: 'טלפון',                  en: 'Phone',                type: 'string',  required: true  },
  { key: 'email',             section: 'A', he: 'דוא"ל',                  en: 'Email',                type: 'string',  required: true  },

  // Section B — marital status & children (מצב משפחתי וילדים)
  { key: 'marital_status',    section: 'B', he: 'מצב משפחתי',              en: 'Marital status',       type: 'enum',    required: true, options: ['single','married','divorced','widowed','separated'] },
  { key: 'spouse_name',       section: 'B', he: 'שם בן/בת הזוג',           en: 'Spouse name',          type: 'string',  required: false },
  { key: 'spouse_tz',         section: 'B', he: 'ת.ז. בן/בת הזוג',         en: 'Spouse ID',            type: 'id',      required: false },
  { key: 'spouse_works',      section: 'B', he: 'בן/בת הזוג עובד/ת',      en: 'Spouse employed',      type: 'bool',    required: false },
  { key: 'spouse_income',     section: 'B', he: 'הכנסת בן/בת הזוג',        en: 'Spouse income',        type: 'decimal', required: false },
  { key: 'children_count',    section: 'B', he: 'מספר ילדים',              en: 'Number of children',   type: 'int',     required: true  },
  { key: 'children_under_18', section: 'B', he: 'ילדים עד גיל 18',         en: 'Children under 18',    type: 'int',     required: false },
  { key: 'children_details',  section: 'B', he: 'פרטי ילדים (שם, ת.ז., תאריך לידה)', en: 'Children details', type: 'array', required: false },

  // Section C — income sources (מקורות הכנסה)
  { key: 'is_primary_employer',section: 'C', he: 'משכורת עיקרית אצל מעסיק זה', en: 'Primary employer?',  type: 'bool',   required: true  },
  { key: 'other_income',       section: 'C', he: 'הכנסה ממקור אחר',         en: 'Other income sources', type: 'bool',    required: true  },
  { key: 'other_income_type',  section: 'C', he: 'סוג הכנסה אחרת',          en: 'Other income type',    type: 'enum',    required: false, options: ['salary','pension','business','rent','other'] },
  { key: 'other_income_amount',section: 'C', he: 'סכום הכנסה אחרת',         en: 'Other income amount',  type: 'decimal', required: false },
  { key: 'additional_employer',section: 'C', he: 'מעסיק נוסף',             en: 'Additional employer',  type: 'string',  required: false },
  { key: 'pension_received',   section: 'C', he: 'מקבל/ת קצבה',            en: 'Receiving pension',    type: 'bool',    required: false },

  // Section D — tax credit points eligibility (נקודות זיכוי)
  // Base is 2.25 for male residents / 2.75 for female residents in 2026.
  { key: 'is_resident',        section: 'D', he: 'תושב/ת ישראל',           en: 'Israeli resident',     type: 'bool',    required: true  },
  { key: 'new_immigrant',      section: 'D', he: 'עולה חדש',               en: 'New immigrant (Oleh)', type: 'bool',    required: false },
  { key: 'single_parent',      section: 'D', he: 'הורה יחיד',              en: 'Single parent',        type: 'bool',    required: false },
  { key: 'disability',         section: 'D', he: 'נכה',                    en: 'Disabled',             type: 'bool',    required: false },
  { key: 'disability_cert',    section: 'D', he: 'אישור נכות',             en: 'Disability certificate', type: 'string', required: false },
  { key: 'soldier_discharge',  section: 'D', he: 'חייל משוחרר',            en: 'Discharged soldier',   type: 'bool',    required: false },
  { key: 'discharge_date',     section: 'D', he: 'תאריך שחרור מצה"ל',      en: 'Discharge date',       type: 'date',    required: false },
  { key: 'academic_degree',    section: 'D', he: 'בעל/ת תואר אקדמי',       en: 'Academic degree',      type: 'bool',    required: false },
  { key: 'development_town',   section: 'D', he: 'יישוב מזכה',              en: 'Development town',     type: 'bool',    required: false },
  { key: 'credit_points_claimed',section: 'D', he: 'נקודות זיכוי נתבעות',   en: 'Credit points claimed',type: 'decimal', required: true  },

  // Section E — declaration (הצהרה)
  { key: 'declaration_true',   section: 'E', he: 'הצהרה על אמיתות הפרטים',  en: 'Declaration of truth', type: 'bool',    required: true  },
  { key: 'signature',          section: 'E', he: 'חתימת העובד',             en: 'Employee signature',   type: 'string',  required: true  },
  { key: 'signature_date',     section: 'E', he: 'תאריך חתימה',              en: 'Signature date',       type: 'date',    required: true  },
]);

// ═══════════════════════════════════════════════════════════════════
// ROLE EQUIPMENT MATRIX
// ═══════════════════════════════════════════════════════════════════

/**
 * Role-keyed equipment checklist. Each item ships with bilingual label
 * and a `mandatory` flag so QA can audit compliance. Roles are
 * normalised to lower-case snake_case. Unknown roles fall back to
 * `office_worker`.
 */
const ROLE_EQUIPMENT = Object.freeze({
  office_worker: [
    { id: 'laptop',      he: 'מחשב נייד',          en: 'Laptop',         mandatory: true  },
    { id: 'mouse',       he: 'עכבר',                en: 'Mouse',          mandatory: true  },
    { id: 'keyboard',    he: 'מקלדת',               en: 'Keyboard',       mandatory: true  },
    { id: 'monitor',     he: 'מסך',                 en: 'Monitor',        mandatory: true  },
    { id: 'headset',     he: 'אוזניות',              en: 'Headset',        mandatory: false },
    { id: 'phone',       he: 'טלפון סלולרי',        en: 'Mobile phone',   mandatory: false },
    { id: 'access_card', he: 'כרטיס כניסה',        en: 'Access card',    mandatory: true  },
    { id: 'chair',       he: 'כיסא ארגונומי',      en: 'Ergonomic chair', mandatory: true  },
  ],
  manager: [
    { id: 'laptop',         he: 'מחשב נייד',          en: 'Laptop',          mandatory: true  },
    { id: 'phone',          he: 'טלפון סלולרי',        en: 'Mobile phone',    mandatory: true  },
    { id: 'access_card',    he: 'כרטיס כניסה',        en: 'Access card',     mandatory: true  },
    { id: 'credit_card',    he: 'כרטיס אשראי חברה',   en: 'Company credit card', mandatory: true },
    { id: 'parking_tag',    he: 'תג חנייה',             en: 'Parking tag',     mandatory: false },
  ],
  factory_worker: [
    { id: 'uniform',        he: 'מדי עבודה',           en: 'Work uniform',     mandatory: true },
    { id: 'safety_shoes',   he: 'נעלי בטיחות',         en: 'Safety shoes',     mandatory: true },
    { id: 'access_card',    he: 'כרטיס כניסה',        en: 'Access card',      mandatory: true },
    { id: 'time_clock_card',he: 'כרטיס שעון נוכחות',  en: 'Time clock card',  mandatory: true },
    { id: 'helmet',         he: 'קסדה',                 en: 'Helmet',           mandatory: true },
    { id: 'vest',           he: 'אפוד זוהר',            en: 'Hi-vis vest',      mandatory: true },
    { id: 'ear_protection', he: 'אטמי אוזניים',        en: 'Ear protection',   mandatory: true },
  ],
  metal_fab: [
    // Metal fabrication — heavy PPE required by תקנות הבטיחות בעבודה
    { id: 'uniform',           he: 'מדי עבודה מחומר עמיד בחום', en: 'Heat-resistant uniform', mandatory: true },
    { id: 'safety_shoes',      he: 'נעלי בטיחות S3',           en: 'Safety shoes S3',        mandatory: true },
    { id: 'access_card',       he: 'כרטיס כניסה',              en: 'Access card',            mandatory: true },
    { id: 'welding_helmet',    he: 'קסדת ריתוך',                en: 'Welding helmet',         mandatory: true },
    { id: 'welding_gloves',    he: 'כפפות ריתוך',               en: 'Welding gloves',         mandatory: true },
    { id: 'apron',             he: 'סינר עור',                  en: 'Leather apron',          mandatory: true },
    { id: 'goggles',           he: 'משקפי מגן',                en: 'Safety goggles',         mandatory: true },
    { id: 'respirator',        he: 'מסכת נשימה',                en: 'Respirator',             mandatory: true },
    { id: 'ear_protection',    he: 'אטמי אוזניים',              en: 'Ear protection',         mandatory: true },
    { id: 'cut_resistant_gloves', he: 'כפפות נגד חיתוך',       en: 'Cut-resistant gloves',   mandatory: true },
  ],
  driver: [
    { id: 'uniform',      he: 'מדי עבודה',      en: 'Uniform',           mandatory: true },
    { id: 'phone',        he: 'טלפון סלולרי',   en: 'Mobile phone',      mandatory: true },
    { id: 'gps',          he: 'מכשיר ניווט',   en: 'GPS device',         mandatory: true },
    { id: 'fuel_card',    he: 'כרטיס דלק',     en: 'Fuel card',          mandatory: true },
    { id: 'safety_vest',  he: 'אפוד זוהר',     en: 'Hi-vis vest',        mandatory: true },
  ],
});

// ═══════════════════════════════════════════════════════════════════
// HELPERS
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

function isValidTz(tz) {
  // Israeli tz (ת.ז.) — Luhn-like checksum over 9 digits (zero-pad).
  if (tz == null) return false;
  const raw = String(tz).trim();
  if (raw === '' || !/^\d+$/.test(raw) || raw.length > 9) return false;
  const s = raw.padStart(9, '0');
  // Reject the all-zero / degenerate case — not a real ID
  if (/^0+$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(s[i]) * ((i % 2) + 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}

/**
 * Default in-memory store — swap with any object that implements the
 * same `save`, `get`, `all`, `listByStatus` interface for persistence.
 */
function createMemoryStore() {
  const map = new Map();
  return {
    save(record) {
      map.set(record.id, record);
      return record;
    },
    get(id) {
      return map.get(id) || null;
    },
    all() {
      return Array.from(map.values());
    },
    listByStatus(status) {
      return this.all().filter((r) => r.status === status);
    },
    // Intentionally no delete() — לא מוחקים רק משדרגים ומגדלים
  };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN CLASS — OnboardingWorkflow
// ═══════════════════════════════════════════════════════════════════

class OnboardingWorkflow {
  /**
   * @param {object} [options]
   * @param {object} [options.store]   — persistence adapter (default in-memory)
   * @param {function} [options.now]    — clock injection for tests
   * @param {Array}  [options.buddyPool]— available buddies [{id,name,seniorityYears,department}]
   * @param {object} [options.logger]   — optional { info, warn, error } sink
   */
  constructor(options = {}) {
    this.store     = options.store    || createMemoryStore();
    this.now       = options.now      || (() => new Date());
    this.buddyPool = options.buddyPool || [];
    this.logger    = options.logger   || { info() {}, warn() {}, error() {} };
    this.audit     = [];
  }

  // ───────────────────────────────────────────────────────────────
  // STATIC CONSTANTS (exposed for UI / tests)
  // ───────────────────────────────────────────────────────────────
  static get PHASES()       { return PHASES; }
  static get TASK_STATUS()  { return TASK_STATUS; }
  static get FORM_101_FIELDS() { return FORM_101_FIELDS; }
  static get ROLE_EQUIPMENT()  { return ROLE_EQUIPMENT; }
  static get LABELS()       { return LABELS; }

  // ───────────────────────────────────────────────────────────────
  // MAIN PUBLIC METHODS
  // ───────────────────────────────────────────────────────────────

  /**
   * Kick off an onboarding workflow for a single new hire.
   * @param {object} arg
   * @param {object} arg.employee — { name, id, email, phone, address, startDate, position, department, manager, role? }
   * @returns {object} onboarding record
   */
  startOnboarding({ employee } = {}) {
    if (!employee) throw new Error('employee is required');
    const required = ['name', 'id', 'email', 'phone', 'address', 'startDate', 'position', 'department', 'manager'];
    const missing = required.filter((f) => employee[f] == null || employee[f] === '');
    if (missing.length) {
      throw new Error('Missing employee fields: ' + missing.join(', '));
    }

    const startDate = toDate(employee.startDate);
    if (isNaN(startDate.getTime())) throw new Error('Invalid startDate');

    const onboardingId = genId('onb');

    // Build task instances from templates
    const tasks = TASK_TEMPLATES.map((tpl) => ({
      id:        tpl.id,
      templateId:tpl.id,
      phase:     tpl.phase,
      label:     LABELS[tpl.labelKey],
      labelKey:  tpl.labelKey,
      dueAt:     addDays(startDate, tpl.offsetDays).toISOString(),
      offsetDays:tpl.offsetDays,
      mandatory: tpl.mandatory,
      legal:     tpl.legal || null,
      status:    TASK_STATUS.PENDING,
      completedAt: null,
      completedBy: null,
      notes:     null,
      evidence:  null,
      history:   [],  // append-only — never deleted
    }));

    // Role-specific equipment
    const roleKey = normalizeRole(employee.role || employee.position);
    const equipment = this.equipmentChecklist({ role: roleKey });

    // Buddy assignment (pre-boarding task body)
    const buddy = this.buddyAssignment(employee.id);

    const record = {
      id: onboardingId,
      employee: deepCloneSafe(employee),
      status: ONBOARDING_STATUS.ACTIVE,
      startDate: startDate.toISOString(),
      createdAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
      phases: PHASE_ORDER.slice(),
      currentPhase: computeCurrentPhase(this.now(), startDate),
      tasks,
      equipment,
      buddy,
      form101: null, // filled by generate101()
      history: [
        { at: this.now().toISOString(), event: 'created', by: employee.manager },
      ],
    };

    this.store.save(record);
    this.audit.push({ at: this.now().toISOString(), action: 'startOnboarding', id: onboardingId });
    this.logger.info && this.logger.info('Onboarding started', { id: onboardingId, name: employee.name });
    return record;
  }

  /**
   * Mark a task complete. Never deletes; appends to history.
   * @returns {object} updated task
   */
  markTaskComplete(onboardingId, taskId, by, notes, evidence) {
    const record = this.store.get(onboardingId);
    if (!record) throw new Error('Onboarding not found: ' + onboardingId);
    const task = record.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Task not found: ' + taskId);

    const prevStatus = task.status;
    task.history.push({
      at: this.now().toISOString(),
      from: prevStatus,
      to: TASK_STATUS.DONE,
      by: by || null,
      notes: notes || null,
      evidence: evidence || null,
    });
    task.status = TASK_STATUS.DONE;
    task.completedAt = this.now().toISOString();
    task.completedBy = by || null;
    task.notes = notes || task.notes;
    task.evidence = evidence || task.evidence;

    record.updatedAt = this.now().toISOString();

    // Auto-advance phase if the one that owned this task is fully done
    record.currentPhase = computeCurrentPhase(this.now(), toDate(record.startDate));

    // Complete the whole onboarding if every mandatory task is done
    const outstanding = record.tasks.filter((t) => t.mandatory && t.status !== TASK_STATUS.DONE && t.status !== TASK_STATUS.SKIPPED);
    if (outstanding.length === 0 && record.status === ONBOARDING_STATUS.ACTIVE) {
      record.status = ONBOARDING_STATUS.COMPLETED;
      record.history.push({ at: this.now().toISOString(), event: 'completed', by });
    }

    this.store.save(record);
    this.audit.push({ at: this.now().toISOString(), action: 'markTaskComplete', id: onboardingId, taskId });
    return task;
  }

  /**
   * Build a Form 101 (טופס 101) payload from employee data.
   * @returns {object} { employee, fields, values, missing, isComplete, issuedAt }
   */
  generate101({ employee } = {}) {
    if (!employee) throw new Error('employee is required');

    // Pre-fill known values from the employee record
    const values = {};
    values.full_name = employee.name || null;
    values.tz        = employee.id   || null;
    values.date_of_birth = employee.dateOfBirth || null;
    values.aliyah_date   = employee.aliyahDate  || null;
    values.country_of_birth = employee.countryOfBirth || null;
    values.gender        = employee.gender || null;
    values.address       = employee.address || null;
    values.phone         = employee.phone || null;
    values.email         = employee.email || null;

    values.marital_status = employee.maritalStatus || null;
    values.spouse_name    = employee.spouseName || null;
    values.spouse_tz      = employee.spouseTz || null;
    values.spouse_works   = employee.spouseWorks != null ? !!employee.spouseWorks : null;
    values.spouse_income  = employee.spouseIncome != null ? Number(employee.spouseIncome) : null;
    values.children_count = employee.childrenCount != null ? Number(employee.childrenCount) : null;
    values.children_under_18 = employee.childrenUnder18 != null ? Number(employee.childrenUnder18) : null;
    values.children_details  = Array.isArray(employee.children) ? employee.children : null;

    values.is_primary_employer = employee.isPrimaryEmployer != null ? !!employee.isPrimaryEmployer : true;
    values.other_income        = employee.otherIncome != null ? !!employee.otherIncome : false;
    values.other_income_type   = employee.otherIncomeType || null;
    values.other_income_amount = employee.otherIncomeAmount != null ? Number(employee.otherIncomeAmount) : null;
    values.additional_employer = employee.additionalEmployer || null;
    values.pension_received    = employee.pensionReceived != null ? !!employee.pensionReceived : false;

    values.is_resident        = employee.isResident != null ? !!employee.isResident : true;
    values.new_immigrant      = employee.newImmigrant || false;
    values.single_parent      = employee.singleParent || false;
    values.disability         = employee.disability || false;
    values.disability_cert    = employee.disabilityCert || null;
    values.soldier_discharge  = employee.soldierDischarge || false;
    values.discharge_date     = employee.dischargeDate || null;
    values.academic_degree    = employee.academicDegree || false;
    values.development_town   = employee.developmentTown || false;

    // Compute default credit points (נקודות זיכוי) — 2026 defaults
    values.credit_points_claimed = computeCreditPoints(employee);

    values.declaration_true = false;   // employee must tick
    values.signature        = null;
    values.signature_date   = null;

    // Validate TZ
    const tzValid = isValidTz(values.tz);

    // Report missing required fields
    const missing = FORM_101_FIELDS.filter((f) => f.required && (values[f.key] == null || values[f.key] === ''))
      .map((f) => f.key);

    const form = {
      formCode: '101',
      formHeName: 'טופס 101 — פרטי עובד',
      formEnName: 'Form 101 — Employee Details Declaration',
      issuedAt: this.now().toISOString(),
      taxYear: this.now().getFullYear(),
      employee: {
        name: employee.name,
        tz: employee.id,
      },
      fields: FORM_101_FIELDS,
      values,
      tzValid,
      missing,
      isComplete: missing.length === 0 && tzValid,
    };
    return form;
  }

  /**
   * Return the equipment checklist for a role (bilingual).
   * Unknown roles fall back to office_worker.
   */
  equipmentChecklist({ role } = {}) {
    const key = normalizeRole(role);
    const list = ROLE_EQUIPMENT[key] || ROLE_EQUIPMENT.office_worker;
    return list.map((item) => ({ ...item, status: 'pending', deliveredAt: null }));
  }

  /**
   * Assign a buddy from the pool. Prefers same-department, highest
   * seniority, not currently overloaded. Pure function over state.
   */
  buddyAssignment(employeeId) {
    if (!this.buddyPool || this.buddyPool.length === 0) {
      return {
        assigned: false,
        reason: 'no-buddy-pool',
        he: 'אין חונכים זמינים',
        en: 'No buddies available',
      };
    }
    const targetRecord = this.store.all().find((r) => r.employee.id === employeeId);
    const dept = targetRecord ? targetRecord.employee.department : null;

    // Rank candidates: same-dept > seniority > fewer current assignments
    const assignmentsByBuddy = {};
    for (const rec of this.store.all()) {
      if (rec.buddy && rec.buddy.id) {
        assignmentsByBuddy[rec.buddy.id] = (assignmentsByBuddy[rec.buddy.id] || 0) + 1;
      }
    }
    const ranked = this.buddyPool.slice().sort((a, b) => {
      const sameA = a.department === dept ? 1 : 0;
      const sameB = b.department === dept ? 1 : 0;
      if (sameA !== sameB) return sameB - sameA;
      if ((a.seniorityYears || 0) !== (b.seniorityYears || 0)) return (b.seniorityYears || 0) - (a.seniorityYears || 0);
      return (assignmentsByBuddy[a.id] || 0) - (assignmentsByBuddy[b.id] || 0);
    });

    const chosen = ranked[0];
    return {
      assigned: true,
      id: chosen.id,
      name: chosen.name,
      seniorityYears: chosen.seniorityYears || 0,
      department: chosen.department || null,
      he: 'חונך/ת: ' + chosen.name,
      en: 'Buddy: ' + chosen.name,
    };
  }

  /**
   * Return mandatory tasks that are overdue (dueAt < now AND not done/cancelled).
   * Also transitions their `status` to OVERDUE (history preserved).
   */
  alertBlockers(onboardingId) {
    const record = this.store.get(onboardingId);
    if (!record) throw new Error('Onboarding not found: ' + onboardingId);

    const now = this.now();
    const blockers = [];

    for (const task of record.tasks) {
      if (task.status === TASK_STATUS.DONE || task.status === TASK_STATUS.CANCELLED) continue;
      const due = toDate(task.dueAt);
      if (due < now && task.mandatory) {
        if (task.status !== TASK_STATUS.OVERDUE) {
          task.history.push({
            at: now.toISOString(),
            from: task.status,
            to: TASK_STATUS.OVERDUE,
            reason: 'auto-detected',
          });
          task.status = TASK_STATUS.OVERDUE;
        }
        blockers.push({
          taskId: task.id,
          phase: task.phase,
          label: task.label,
          dueAt: task.dueAt,
          daysOverdue: Math.max(1, Math.floor((now - due) / MS_PER_DAY)),
          legal: task.legal,
        });
      }
    }

    record.updatedAt = now.toISOString();
    this.store.save(record);

    return {
      onboardingId,
      employee: record.employee.name,
      count: blockers.length,
      blockers,
      severity: severityFor(blockers.length),
      alertHe: blockers.length ? `נמצאו ${blockers.length} חסמים בקליטת ${record.employee.name}` : 'אין חסמים',
      alertEn: blockers.length ? `${blockers.length} blocker(s) found for ${record.employee.name}` : 'No blockers',
    };
  }

  // ───────────────────────────────────────────────────────────────
  // Utility accessors
  // ───────────────────────────────────────────────────────────────
  getOnboarding(id) { return this.store.get(id); }
  listAll()          { return this.store.all(); }
  listByPhase(phase) { return this.store.all().filter((r) => r.currentPhase === phase); }
}

// ═══════════════════════════════════════════════════════════════════
// PURE HELPERS
// ═══════════════════════════════════════════════════════════════════

function computeCurrentPhase(now, startDate) {
  const diffDays = (toDate(now).getTime() - toDate(startDate).getTime()) / MS_PER_DAY;
  if (diffDays < 0)     return PHASES.PRE_BOARDING;
  if (diffDays < 1)     return PHASES.DAY_1;
  if (diffDays < 7)     return PHASES.WEEK_1;
  if (diffDays < 30)    return PHASES.MONTH_1;
  return PHASES.MONTH_3;
}

function severityFor(n) {
  if (n === 0) return 'none';
  if (n <= 2)  return 'low';
  if (n <= 5)  return 'medium';
  return 'high';
}

function normalizeRole(role) {
  if (!role) return 'office_worker';
  const s = String(role).toLowerCase().replace(/[\s-]+/g, '_');
  if (s in ROLE_EQUIPMENT) return s;
  // Heuristics
  if (/(welder|metal|fab|riter|jointer|joshker|sadna)/.test(s)) return 'metal_fab';
  if (/(factory|production|assembly|worker|poel|machsan)/.test(s)) return 'factory_worker';
  if (/(driver|shaliach|nahag)/.test(s)) return 'driver';
  if (/(manager|mnahel|director)/.test(s)) return 'manager';
  return 'office_worker';
}

/**
 * Compute default credit points (נקודות זיכוי) for Form 101 (2026 rules,
 * simplified). The real calculation has dozens of edge cases — this is a
 * best-effort default that satisfies the most common employees. The
 * employee can always override.
 *
 * Base:  male resident 2.25 / female resident 2.75
 * + 1.0 per Israeli resident dependent spouse (non-working)
 * + 0.5 per child under 18 (up to 5 children)
 * + 1.0 new immigrant (first 18 months)
 * + 0.5 academic degree (1 year after certification)
 * + 1.0 single parent
 * + 2.0 disabled (blind or 100% disability)
 */
function computeCreditPoints(emp) {
  if (!emp || !emp.isResident) return 0;
  let pts = emp.gender === 'female' ? 2.75 : 2.25;
  if (emp.maritalStatus === 'married' && emp.spouseWorks === false) pts += 1;
  const kids = Math.min(5, Number(emp.childrenUnder18 || emp.childrenCount || 0));
  pts += 0.5 * kids;
  if (emp.newImmigrant) pts += 1;
  if (emp.academicDegree) pts += 0.5;
  if (emp.singleParent) pts += 1;
  if (emp.disability) pts += 2;
  return Math.round(pts * 100) / 100;
}

function deepCloneSafe(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepCloneSafe);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepCloneSafe(obj[k]);
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  OnboardingWorkflow,
  PHASES,
  PHASE_ORDER,
  TASK_STATUS,
  ONBOARDING_STATUS,
  FORM_101_FIELDS,
  ROLE_EQUIPMENT,
  LABELS,
  TASK_TEMPLATES,
  createMemoryStore,
  isValidTz,
  normalizeRole,
  computeCreditPoints,
  computeCurrentPhase,
};
