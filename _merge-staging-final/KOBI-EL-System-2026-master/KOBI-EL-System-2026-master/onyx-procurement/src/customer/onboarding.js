/**
 * Customer Onboarding Workflow Engine — קליטת לקוח
 * Agent Y-98 • Techno-Kol Uzi mega-ERP • Swarm Customer Success
 *
 * Zero-dependency pure workflow runtime that walks a newly-signed customer
 * through every phase of the commercial onboarding lifecycle — Kickoff,
 * Discovery, Setup, Configuration, Training, UAT, Go-Live, and the 30-day
 * post-launch review — with task sequencing, risk assessment, blocker
 * escalation, stuck-detection, traffic-light health scoring, and a
 * graceful handoff to ongoing Customer Success Management.
 *
 * NOT employee onboarding. The HR-side new-hire flow lives in
 *   src/hr/onboarding.js (Agent Y-63).
 * That file is explicitly left intact and untouched per the ERP rule
 *   לא מוחקים רק משדרגים ומגדלים — we only grow, never delete.
 *
 * Bilingual: every phase, task, and checklist item ships with { he, en }
 * labels so the UI can render Hebrew-RTL or English-LTR freely.
 *
 * Zero deps. Node >= 14. Pure in-memory by default; swap in a `store`
 * adapter for persistence (see constructor).
 *
 * Public exports:
 *   class  CustomerOnboarding         — main workflow engine
 *   const  PHASES                     — frozen phase map
 *   const  PHASE_ORDER                — ordered array of phases
 *   const  TASK_STATUS                — task lifecycle statuses
 *   const  ONBOARDING_STATUS          — top-level record status
 *   const  HEALTH                     — traffic-light colors
 *   const  RISK_LEVEL                 — risk severity levels
 *   const  ESCALATION_LEVEL           — escalation tiers
 *   const  LABELS                     — bilingual label dictionary
 *   const  PHASE_TASK_TEMPLATES       — per-phase task templates
 *   const  DISCOVERY_QUESTIONNAIRE    — standard requirements questions
 *   const  UAT_CHECKLIST_TEMPLATE     — UAT validation items
 *   const  GO_LIVE_CHECKLIST_TEMPLATE — final gate items
 *   const  DEFAULT_SUCCESS_METRICS    — baseline KPI catalog
 *   const  RISK_CATALOG               — known risk patterns
 *   function createMemoryStore()
 *   function computeCurrentPhase()
 *   function phaseIndex()
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — phases, statuses, health, escalation, risk
// ═══════════════════════════════════════════════════════════════════

/** Customer-onboarding phases in temporal order */
const PHASES = Object.freeze({
  KICKOFF:        'kickoff',
  DISCOVERY:      'discovery',
  SETUP:          'setup',
  CONFIGURATION:  'configuration',
  TRAINING:       'training',
  UAT:            'uat',
  GO_LIVE:        'go_live',
  REVIEW_30D:     'review_30d',
});

const PHASE_ORDER = Object.freeze([
  PHASES.KICKOFF,
  PHASES.DISCOVERY,
  PHASES.SETUP,
  PHASES.CONFIGURATION,
  PHASES.TRAINING,
  PHASES.UAT,
  PHASES.GO_LIVE,
  PHASES.REVIEW_30D,
]);

/** Task lifecycle — legacy statuses never disappear, only transition */
const TASK_STATUS = Object.freeze({
  PENDING:     'pending',
  IN_PROGRESS: 'in_progress',
  DONE:        'done',
  BLOCKED:     'blocked',
  OVERDUE:     'overdue',
  SKIPPED:     'skipped',    // skip ≠ delete, audit record kept
  CANCELLED:   'cancelled',  // cancel ≠ delete, audit record kept
});

/** Top-level onboarding record status */
const ONBOARDING_STATUS = Object.freeze({
  ACTIVE:     'active',
  PAUSED:     'paused',
  ESCALATED:  'escalated',
  COMPLETED:  'completed',
  HANDED_OFF: 'handed_off',
  CANCELLED:  'cancelled',  // e.g. contract withdrawn — history preserved
});

/** Traffic-light health colors */
const HEALTH = Object.freeze({
  GREEN:  'green',
  YELLOW: 'yellow',
  RED:    'red',
});

/** Risk severity levels */
const RISK_LEVEL = Object.freeze({
  LOW:      'low',
  MEDIUM:   'medium',
  HIGH:     'high',
  CRITICAL: 'critical',
});

/** Escalation ladder */
const ESCALATION_LEVEL = Object.freeze({
  NONE:      'none',
  L1_OWNER:  'l1_owner',       // onboarding owner / PM
  L2_LEAD:   'l2_lead',        // CS team lead
  L3_DIR:    'l3_director',    // CS director / VP
  L4_EXEC:   'l4_exec',        // C-level / joint steering
});

/** Number of calendar days per phase before "stuck" alert triggers */
const PHASE_STUCK_THRESHOLD_DAYS = Object.freeze({
  [PHASES.KICKOFF]:       3,
  [PHASES.DISCOVERY]:     10,
  [PHASES.SETUP]:         14,
  [PHASES.CONFIGURATION]: 14,
  [PHASES.TRAINING]:      10,
  [PHASES.UAT]:           14,
  [PHASES.GO_LIVE]:       5,
  [PHASES.REVIEW_30D]:    30,
});

/** Soft per-phase duration targets (days) — used for planning */
const PHASE_TARGET_DAYS = Object.freeze({
  [PHASES.KICKOFF]:       2,
  [PHASES.DISCOVERY]:     7,
  [PHASES.SETUP]:         10,
  [PHASES.CONFIGURATION]: 10,
  [PHASES.TRAINING]:      7,
  [PHASES.UAT]:           10,
  [PHASES.GO_LIVE]:       3,
  [PHASES.REVIEW_30D]:    30,
});

const MS_PER_DAY = 86_400_000;

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS
// ═══════════════════════════════════════════════════════════════════

const LABELS = Object.freeze({
  // Phases
  KICKOFF:       { he: 'פגישת פתיחה',           en: 'Kickoff' },
  DISCOVERY:     { he: 'איסוף דרישות',          en: 'Discovery' },
  SETUP:         { he: 'הקמה',                  en: 'Setup' },
  CONFIGURATION: { he: 'הגדרות והתאמה',         en: 'Configuration' },
  TRAINING:      { he: 'הדרכה',                 en: 'Training' },
  UAT:           { he: 'בדיקות קבלה (UAT)',    en: 'User acceptance testing' },
  GO_LIVE:       { he: 'עלייה לאוויר',          en: 'Go-Live' },
  REVIEW_30D:    { he: 'סקירת 30 יום',          en: '30-day review' },

  // Health
  GREEN:  { he: 'ירוק — תקין',         en: 'Green — healthy' },
  YELLOW: { he: 'צהוב — לב שם',        en: 'Yellow — watch' },
  RED:    { he: 'אדום — בסיכון',       en: 'Red — at risk' },

  // Kickoff tasks
  KICKOFF_SCHEDULE:     { he: 'תיאום פגישת פתיחה',          en: 'Schedule kickoff meeting' },
  KICKOFF_AGENDA:       { he: 'הכנת סדר-יום',                en: 'Prepare kickoff agenda' },
  KICKOFF_STAKEHOLDERS: { he: 'מיפוי בעלי עניין',            en: 'Map stakeholders' },
  KICKOFF_CHARTER:      { he: 'צ׳רטר פרויקט',                en: 'Project charter' },

  // Discovery tasks
  DISCOVERY_QUESTIONS:   { he: 'שאלון גילוי דרישות',         en: 'Discovery questionnaire' },
  DISCOVERY_INTERVIEW:   { he: 'ראיונות עם בעלי עניין',      en: 'Stakeholder interviews' },
  DISCOVERY_DATA_AUDIT:  { he: 'בדיקת נתונים קיימים',        en: 'Existing data audit' },
  DISCOVERY_WORKFLOWS:   { he: 'מיפוי תהליכי עבודה',         en: 'Workflow mapping' },
  DISCOVERY_INTEGRATIONS:{ he: 'זיהוי אינטגרציות',           en: 'Integration mapping' },

  // Setup tasks
  SETUP_TENANT:     { he: 'הקמת סביבת לקוח',                 en: 'Provision tenant' },
  SETUP_ACCOUNTS:   { he: 'יצירת משתמשים והרשאות',           en: 'Create accounts & roles' },
  SETUP_DATA_MIG:   { he: 'העברת נתונים ראשונית',            en: 'Initial data migration' },
  SETUP_DNS:        { he: 'הגדרות DNS ודומיין',              en: 'DNS / domain setup' },
  SETUP_SSO:        { he: 'חיבור SSO',                        en: 'SSO integration' },
  SETUP_BACKUP:     { he: 'הגדרת גיבוי ושחזור',              en: 'Backup & restore setup' },

  // Configuration tasks
  CONFIG_PRODUCT:      { he: 'התאמת המוצר',                  en: 'Product configuration' },
  CONFIG_WORKFLOWS:    { he: 'הגדרת תהליכי עבודה',           en: 'Workflow configuration' },
  CONFIG_TEMPLATES:    { he: 'התאמת תבניות ומסמכים',        en: 'Templates & documents' },
  CONFIG_INTEGRATIONS: { he: 'חיבור מערכות חיצוניות',        en: 'External integrations' },
  CONFIG_BRANDING:     { he: 'מיתוג ולוגו',                   en: 'Branding & logos' },

  // Training tasks
  TRAINING_ADMIN:  { he: 'הדרכת מנהלי מערכת',                en: 'Admin training' },
  TRAINING_USERS:  { he: 'הדרכת משתמשי קצה',                 en: 'End-user training' },
  TRAINING_DOCS:   { he: 'חומרי עזר ו-FAQ',                  en: 'Docs & FAQ handout' },
  TRAINING_RECORD: { he: 'הקלטת הדרכות',                     en: 'Record training sessions' },

  // UAT tasks
  UAT_PLAN:    { he: 'תכנית UAT',                             en: 'UAT plan' },
  UAT_CASES:   { he: 'תסריטי בדיקה',                          en: 'UAT test cases' },
  UAT_EXEC:    { he: 'ביצוע UAT',                             en: 'UAT execution' },
  UAT_SIGNOFF: { he: 'אישור לקוח על UAT',                    en: 'Customer UAT sign-off' },

  // Go-Live tasks
  GOLIVE_FREEZE:   { he: 'הקפאת שינויים',                    en: 'Change freeze' },
  GOLIVE_CUTOVER:  { he: 'ביצוע Cutover',                    en: 'Cutover execution' },
  GOLIVE_MONITOR:  { he: 'ניטור פוסט-לייב',                  en: 'Post-live monitoring' },
  GOLIVE_ROLLBACK: { he: 'תוכנית Rollback',                  en: 'Rollback plan' },
  GOLIVE_COMMS:    { he: 'תקשורת למשתמשים',                  en: 'User communication' },

  // 30-day Review
  REVIEW_METRICS:  { he: 'סקירת מדדים',                      en: 'Metrics review' },
  REVIEW_HEALTH:   { he: 'שיחת בריאות עם לקוח',              en: 'Customer health call' },
  REVIEW_HANDOFF:  { he: 'העברה ל-CSM',                      en: 'Handoff to CSM' },
  REVIEW_RETRO:    { he: 'תחקיר פנימי',                      en: 'Internal retro' },
});

// ═══════════════════════════════════════════════════════════════════
// TASK TEMPLATES — per phase
// ═══════════════════════════════════════════════════════════════════

const PHASE_TASK_TEMPLATES = Object.freeze({
  [PHASES.KICKOFF]: Object.freeze([
    { id: 'kickoff_schedule',     labelKey: 'KICKOFF_SCHEDULE',     mandatory: true },
    { id: 'kickoff_agenda',       labelKey: 'KICKOFF_AGENDA',       mandatory: true },
    { id: 'kickoff_stakeholders', labelKey: 'KICKOFF_STAKEHOLDERS', mandatory: true },
    { id: 'kickoff_charter',      labelKey: 'KICKOFF_CHARTER',      mandatory: true },
  ]),
  [PHASES.DISCOVERY]: Object.freeze([
    { id: 'discovery_questions',    labelKey: 'DISCOVERY_QUESTIONS',    mandatory: true },
    { id: 'discovery_interview',    labelKey: 'DISCOVERY_INTERVIEW',    mandatory: true },
    { id: 'discovery_data_audit',   labelKey: 'DISCOVERY_DATA_AUDIT',   mandatory: true },
    { id: 'discovery_workflows',    labelKey: 'DISCOVERY_WORKFLOWS',    mandatory: true },
    { id: 'discovery_integrations', labelKey: 'DISCOVERY_INTEGRATIONS', mandatory: false },
  ]),
  [PHASES.SETUP]: Object.freeze([
    { id: 'setup_tenant',   labelKey: 'SETUP_TENANT',   mandatory: true },
    { id: 'setup_accounts', labelKey: 'SETUP_ACCOUNTS', mandatory: true },
    { id: 'setup_data_mig', labelKey: 'SETUP_DATA_MIG', mandatory: true },
    { id: 'setup_dns',      labelKey: 'SETUP_DNS',      mandatory: false },
    { id: 'setup_sso',      labelKey: 'SETUP_SSO',      mandatory: false },
    { id: 'setup_backup',   labelKey: 'SETUP_BACKUP',   mandatory: true },
  ]),
  [PHASES.CONFIGURATION]: Object.freeze([
    { id: 'config_product',      labelKey: 'CONFIG_PRODUCT',      mandatory: true },
    { id: 'config_workflows',    labelKey: 'CONFIG_WORKFLOWS',    mandatory: true },
    { id: 'config_templates',    labelKey: 'CONFIG_TEMPLATES',    mandatory: true },
    { id: 'config_integrations', labelKey: 'CONFIG_INTEGRATIONS', mandatory: false },
    { id: 'config_branding',     labelKey: 'CONFIG_BRANDING',     mandatory: false },
  ]),
  [PHASES.TRAINING]: Object.freeze([
    { id: 'training_admin',  labelKey: 'TRAINING_ADMIN',  mandatory: true },
    { id: 'training_users',  labelKey: 'TRAINING_USERS',  mandatory: true },
    { id: 'training_docs',   labelKey: 'TRAINING_DOCS',   mandatory: true },
    { id: 'training_record', labelKey: 'TRAINING_RECORD', mandatory: false },
  ]),
  [PHASES.UAT]: Object.freeze([
    { id: 'uat_plan',    labelKey: 'UAT_PLAN',    mandatory: true },
    { id: 'uat_cases',   labelKey: 'UAT_CASES',   mandatory: true },
    { id: 'uat_exec',    labelKey: 'UAT_EXEC',    mandatory: true },
    { id: 'uat_signoff', labelKey: 'UAT_SIGNOFF', mandatory: true },
  ]),
  [PHASES.GO_LIVE]: Object.freeze([
    { id: 'golive_freeze',   labelKey: 'GOLIVE_FREEZE',   mandatory: true },
    { id: 'golive_cutover',  labelKey: 'GOLIVE_CUTOVER',  mandatory: true },
    { id: 'golive_monitor',  labelKey: 'GOLIVE_MONITOR',  mandatory: true },
    { id: 'golive_rollback', labelKey: 'GOLIVE_ROLLBACK', mandatory: true },
    { id: 'golive_comms',    labelKey: 'GOLIVE_COMMS',    mandatory: true },
  ]),
  [PHASES.REVIEW_30D]: Object.freeze([
    { id: 'review_metrics', labelKey: 'REVIEW_METRICS', mandatory: true },
    { id: 'review_health',  labelKey: 'REVIEW_HEALTH',  mandatory: true },
    { id: 'review_handoff', labelKey: 'REVIEW_HANDOFF', mandatory: true },
    { id: 'review_retro',   labelKey: 'REVIEW_RETRO',   mandatory: false },
  ]),
});

// ═══════════════════════════════════════════════════════════════════
// DISCOVERY QUESTIONNAIRE — standard requirements collection
// ═══════════════════════════════════════════════════════════════════

const DISCOVERY_QUESTIONNAIRE = Object.freeze([
  { id: 'business_goals',        he: 'מהן המטרות העסקיות המרכזיות?',                en: 'What are the primary business goals?',             required: true },
  { id: 'success_definition',    he: 'כיצד תגדירו הצלחה בעלייה לאוויר?',            en: 'How do you define go-live success?',               required: true },
  { id: 'user_count',            he: 'כמה משתמשים צפויים להשתמש במערכת?',           en: 'How many users will use the system?',              required: true },
  { id: 'user_roles',            he: 'אילו תפקידי משתמש קיימים?',                    en: 'Which user roles exist?',                          required: true },
  { id: 'current_system',        he: 'איזו מערכת קיימת תוחלף/תתחבר?',               en: 'What current system will be replaced/connected?',   required: true },
  { id: 'data_sources',          he: 'מהם מקורות הנתונים להעברה?',                  en: 'What are the source data systems?',                required: true },
  { id: 'data_volume',           he: 'מה נפח הנתונים (שורות/GB)?',                  en: 'Data volume (rows/GB)?',                           required: true },
  { id: 'integrations_needed',   he: 'אילו אינטגרציות נדרשות (ERP/CRM/BI)?',        en: 'Required integrations (ERP/CRM/BI)?',              required: true },
  { id: 'compliance_needs',      he: 'דרישות תאימות ואבטחה (ISO, GDPR, חוק הגנת פרטיות)?', en: 'Compliance/security requirements (ISO, GDPR, Israeli Privacy Law)?', required: true },
  { id: 'languages_needed',      he: 'אילו שפות נדרשות בממשק?',                     en: 'UI languages needed?',                             required: true },
  { id: 'timezone',              he: 'אזור זמן ראשי?',                               en: 'Primary timezone?',                                required: true },
  { id: 'go_live_date',          he: 'תאריך יעד לעלייה לאוויר?',                    en: 'Target go-live date?',                             required: true },
  { id: 'hard_deadline',         he: 'האם קיים מועד מחייב (רגולציה/אירוע)?',        en: 'Hard deadline (regulatory/event)?',                required: false },
  { id: 'training_prefs',        he: 'העדפות הדרכה (פרונטלית/מקוונת)?',             en: 'Training preferences (in-person/online)?',         required: true },
  { id: 'sme_availability',      he: 'זמינות מומחי נושא (SME)?',                    en: 'Subject-matter expert (SME) availability?',        required: true },
  { id: 'risks_known',           he: 'סיכונים ידועים מראש?',                        en: 'Known risks up front?',                            required: false },
  { id: 'budget_approved',       he: 'תקציב מאושר לפרויקט?',                        en: 'Approved project budget?',                         required: false },
  { id: 'decision_makers',       he: 'מי מקבלי ההחלטות?',                           en: 'Who are the decision-makers?',                     required: true },
  { id: 'escalation_contact',    he: 'איש קשר לאסקלציה מצד הלקוח?',                 en: 'Customer-side escalation contact?',                required: true },
  { id: 'post_launch_support',   he: 'דרישות תמיכה לאחר עלייה לאוויר?',             en: 'Post-launch support expectations?',                required: true },
]);

// ═══════════════════════════════════════════════════════════════════
// UAT CHECKLIST — items to validate before sign-off
// ═══════════════════════════════════════════════════════════════════

const UAT_CHECKLIST_TEMPLATE = Object.freeze([
  { id: 'uat_login',          he: 'התחברות וניהול הרשאות',              en: 'Login & permissions',               mandatory: true },
  { id: 'uat_core_flow',      he: 'זרימות עסקיות עיקריות',              en: 'Core business flows',                mandatory: true },
  { id: 'uat_edge_cases',     he: 'מקרי קצה וחריגים',                   en: 'Edge cases & exceptions',            mandatory: true },
  { id: 'uat_data_accuracy',  he: 'דיוק נתונים מול המערכת הישנה',       en: 'Data accuracy vs legacy',            mandatory: true },
  { id: 'uat_reports',        he: 'דוחות ו-KPIs',                        en: 'Reports & KPIs',                     mandatory: true },
  { id: 'uat_integrations',   he: 'אינטגרציות חיצוניות',                en: 'External integrations',              mandatory: true },
  { id: 'uat_print_pdf',      he: 'הדפסה ו-PDFs',                        en: 'Print & PDFs',                       mandatory: true },
  { id: 'uat_hebrew_rtl',     he: 'תצוגה עברית ו-RTL',                  en: 'Hebrew & RTL rendering',             mandatory: true },
  { id: 'uat_mobile',         he: 'תצוגה בנייד',                         en: 'Mobile rendering',                   mandatory: true },
  { id: 'uat_performance',    he: 'ביצועים תחת עומס צפוי',               en: 'Performance under expected load',    mandatory: true },
  { id: 'uat_accessibility',  he: 'נגישות (WCAG / תקן 5568)',           en: 'Accessibility (WCAG / IS 5568)',     mandatory: true },
  { id: 'uat_rollback_drill', he: 'תרגול Rollback',                      en: 'Rollback drill',                     mandatory: false },
  { id: 'uat_customer_signs', he: 'חתימת לקוח על אישור UAT',             en: 'Customer UAT sign-off',              mandatory: true },
]);

// ═══════════════════════════════════════════════════════════════════
// GO-LIVE CHECKLIST — final gates
// ═══════════════════════════════════════════════════════════════════

const GO_LIVE_CHECKLIST_TEMPLATE = Object.freeze([
  { id: 'gl_uat_signed',         he: 'UAT חתום ע״י הלקוח',                  en: 'Customer UAT signed off',              gate: true },
  { id: 'gl_data_migrated',      he: 'נתונים הועברו ואומתו',                en: 'Data migrated & verified',             gate: true },
  { id: 'gl_backup_verified',    he: 'גיבוי אחרון אומת',                    en: 'Last backup verified',                 gate: true },
  { id: 'gl_rollback_ready',     he: 'תוכנית Rollback מוכנה',               en: 'Rollback plan ready',                  gate: true },
  { id: 'gl_runbook_published',  he: 'Runbook מפורסם',                       en: 'Runbook published',                    gate: true },
  { id: 'gl_oncall_scheduled',   he: 'כוננות מתוזמנת',                      en: 'On-call scheduled',                    gate: true },
  { id: 'gl_comms_sent',         he: 'תקשורת למשתמשים נשלחה',               en: 'User comms sent',                      gate: true },
  { id: 'gl_monitoring_on',      he: 'ניטור מופעל',                          en: 'Monitoring enabled',                   gate: true },
  { id: 'gl_ssl_valid',          he: 'תעודת SSL בתוקף',                     en: 'SSL certificate valid',                gate: true },
  { id: 'gl_dns_switched',       he: 'DNS הוחלף',                            en: 'DNS switched',                         gate: true },
  { id: 'gl_training_done',      he: 'כלל ההדרכות הועברו',                  en: 'All trainings delivered',              gate: true },
  { id: 'gl_exec_approval',      he: 'אישור הנהלה',                         en: 'Executive approval',                   gate: true },
  { id: 'gl_support_briefed',    he: 'צוות תמיכה תודרך',                    en: 'Support team briefed',                 gate: true },
  { id: 'gl_legal_docs_signed',  he: 'מסמכים משפטיים חתומים',               en: 'Legal docs signed',                    gate: true },
]);

// ═══════════════════════════════════════════════════════════════════
// DEFAULT SUCCESS METRICS — baseline KPI catalog
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_SUCCESS_METRICS = Object.freeze([
  { id: 'time_to_value',      he: 'זמן עד ערך (ימים)',                  en: 'Time to value (days)',             target: 30,  unit: 'days',    direction: 'min' },
  { id: 'active_users_pct',   he: '% משתמשים פעילים',                   en: 'Active users %',                   target: 80,  unit: '%',       direction: 'max' },
  { id: 'feature_adoption',   he: 'אימוץ פיצ׳רים',                     en: 'Feature adoption',                 target: 70,  unit: '%',       direction: 'max' },
  { id: 'support_tickets',    he: 'כמות פניות תמיכה / שבוע',            en: 'Support tickets / week',           target: 10,  unit: 'tickets', direction: 'min' },
  { id: 'nps_score',          he: 'ציון NPS',                            en: 'NPS score',                        target: 30,  unit: 'nps',     direction: 'max' },
  { id: 'csat_score',         he: 'שביעות רצון CSAT',                   en: 'CSAT score',                       target: 4.2, unit: 'csat',    direction: 'max' },
  { id: 'data_accuracy',      he: 'דיוק נתונים (%)',                   en: 'Data accuracy (%)',                target: 99,  unit: '%',       direction: 'max' },
  { id: 'uptime_pct',         he: 'זמינות (%)',                         en: 'Uptime (%)',                       target: 99.5, unit: '%',      direction: 'max' },
]);

// ═══════════════════════════════════════════════════════════════════
// RISK CATALOG — known risk patterns for auto-identification
// ═══════════════════════════════════════════════════════════════════

const RISK_CATALOG = Object.freeze([
  {
    id: 'late_data',
    he: 'נתונים המגיעים באיחור מצד הלקוח',
    en: 'Customer-side data arriving late',
    triggers: ['discovery_data_audit', 'setup_data_mig'],
    defaultLevel: RISK_LEVEL.HIGH,
    mitigation: { he: 'להעלות נושא בישיבה שבועית; לבקש SME ייעודי', en: 'Escalate at weekly sync; request dedicated SME' },
  },
  {
    id: 'missing_sme',
    he: 'חוסר זמינות מומחה נושא (SME) מצד הלקוח',
    en: 'Customer SME unavailable',
    triggers: ['discovery_interview', 'config_workflows'],
    defaultLevel: RISK_LEVEL.HIGH,
    mitigation: { he: 'להגדיר SME חלופי; לתאם זמינות קבועה', en: 'Designate backup SME; lock recurring availability' },
  },
  {
    id: 'scope_creep',
    he: 'זחילת דרישות',
    en: 'Scope creep',
    triggers: ['configuration', 'uat'],
    defaultLevel: RISK_LEVEL.MEDIUM,
    mitigation: { he: 'תהליך בקרת שינויים; רישום CR', en: 'Change-control process; CR log' },
  },
  {
    id: 'integration_delay',
    he: 'עיכוב באינטגרציה לצד ג׳',
    en: 'Third-party integration delay',
    triggers: ['setup_sso', 'config_integrations'],
    defaultLevel: RISK_LEVEL.HIGH,
    mitigation: { he: 'התחלה מוקדמת; מוק-סרבר', en: 'Start early; mock server' },
  },
  {
    id: 'stakeholder_misalign',
    he: 'חוסר יישור קו בין בעלי עניין',
    en: 'Stakeholder misalignment',
    triggers: ['kickoff_stakeholders', 'discovery_interview'],
    defaultLevel: RISK_LEVEL.MEDIUM,
    mitigation: { he: 'ועדת היגוי דו-שבועית', en: 'Bi-weekly steering committee' },
  },
  {
    id: 'training_noshow',
    he: 'היעדרות מהדרכות',
    en: 'Training no-shows',
    triggers: ['training_users', 'training_admin'],
    defaultLevel: RISK_LEVEL.MEDIUM,
    mitigation: { he: 'הקלטה והשלמת מפגשים; חובת השתתפות בהסכם', en: 'Record & make-up sessions; attendance SLA' },
  },
  {
    id: 'uat_fail',
    he: 'כישלון בבדיקות UAT',
    en: 'UAT failure',
    triggers: ['uat_exec', 'uat_signoff'],
    defaultLevel: RISK_LEVEL.CRITICAL,
    mitigation: { he: 'Hot-fix; דחיית Go-Live; תקשורת מנהלה', en: 'Hot-fix; postpone go-live; exec comms' },
  },
  {
    id: 'legal_blocker',
    he: 'חסם משפטי/חוזי',
    en: 'Legal/contract blocker',
    triggers: ['kickoff_charter', 'golive_freeze'],
    defaultLevel: RISK_LEVEL.CRITICAL,
    mitigation: { he: 'מעורבות יועץ משפטי; הסלמה מיידית', en: 'Engage counsel; escalate immediately' },
  },
  {
    id: 'budget_overrun',
    he: 'חריגה מתקציב',
    en: 'Budget overrun',
    triggers: ['configuration', 'setup'],
    defaultLevel: RISK_LEVEL.HIGH,
    mitigation: { he: 'Change Order; ועדת היגוי', en: 'Change order; steering committee review' },
  },
  {
    id: 'stuck_phase',
    he: 'שלב תקוע',
    en: 'Phase stuck',
    triggers: [],
    defaultLevel: RISK_LEVEL.MEDIUM,
    mitigation: { he: 'זיהוי חסמים; הסלמה לפי מדיניות', en: 'Identify blockers; escalate per policy' },
  },
]);

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

function daysBetween(a, b) {
  const ms = toDate(b).getTime() - toDate(a).getTime();
  return Math.floor(ms / MS_PER_DAY);
}

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function phaseIndex(phase) {
  return PHASE_ORDER.indexOf(phase);
}

function nextPhase(phase) {
  const i = phaseIndex(phase);
  if (i < 0 || i >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[i + 1];
}

function computeCurrentPhase(record, nowDate) {
  if (!record) return null;
  return record.currentPhase || PHASES.KICKOFF;
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
// MAIN CLASS — CustomerOnboarding
// ═══════════════════════════════════════════════════════════════════

class CustomerOnboarding {
  /**
   * @param {object} [options]
   * @param {object}   [options.store]   persistence adapter (default in-memory)
   * @param {function} [options.now]     clock injection for tests
   * @param {object}   [options.logger]  optional { info, warn, error } sink
   */
  constructor(options = {}) {
    this.store  = options.store  || createMemoryStore();
    this.now    = options.now    || (() => new Date());
    this.logger = options.logger || { info() {}, warn() {}, error() {} };
    this.audit  = [];
  }

  // Static exposure for UI / tests
  static get PHASES()                  { return PHASES; }
  static get PHASE_ORDER()             { return PHASE_ORDER; }
  static get TASK_STATUS()             { return TASK_STATUS; }
  static get ONBOARDING_STATUS()       { return ONBOARDING_STATUS; }
  static get HEALTH()                  { return HEALTH; }
  static get RISK_LEVEL()              { return RISK_LEVEL; }
  static get ESCALATION_LEVEL()        { return ESCALATION_LEVEL; }
  static get LABELS()                  { return LABELS; }
  static get PHASE_TASK_TEMPLATES()    { return PHASE_TASK_TEMPLATES; }
  static get DISCOVERY_QUESTIONNAIRE() { return DISCOVERY_QUESTIONNAIRE; }
  static get UAT_CHECKLIST_TEMPLATE()  { return UAT_CHECKLIST_TEMPLATE; }
  static get GO_LIVE_CHECKLIST_TEMPLATE() { return GO_LIVE_CHECKLIST_TEMPLATE; }
  static get DEFAULT_SUCCESS_METRICS() { return DEFAULT_SUCCESS_METRICS; }
  static get RISK_CATALOG()            { return RISK_CATALOG; }

  // ───────────────────────────────────────────────────────────────
  // 1. initiateOnboarding — entry point
  // ───────────────────────────────────────────────────────────────
  /**
   * Start a new customer onboarding workflow.
   * @param {object} arg
   * @param {string} arg.customerId
   * @param {string} arg.product
   * @param {string} arg.package
   * @param {string} arg.owner            onboarding PM / owner user id
   * @param {Date|string|number} arg.startDate
   * @param {Date|string|number} arg.targetGoLiveDate
   * @param {object} [arg.meta]           free-form metadata bag
   * @returns {object} onboarding record
   */
  initiateOnboarding({ customerId, product, package: pkg, owner, startDate, targetGoLiveDate, meta } = {}) {
    const required = { customerId, product, package: pkg, owner, startDate, targetGoLiveDate };
    const missing = Object.keys(required).filter((k) => required[k] == null || required[k] === '');
    if (missing.length) {
      throw new Error('Missing required fields: ' + missing.join(', '));
    }

    const start = toDate(startDate);
    const target = toDate(targetGoLiveDate);
    if (isNaN(start.getTime()))  throw new Error('Invalid startDate');
    if (isNaN(target.getTime())) throw new Error('Invalid targetGoLiveDate');
    if (target.getTime() < start.getTime()) {
      throw new Error('targetGoLiveDate must be >= startDate');
    }

    const onboardingId = genId('conb');
    const createdAt = this.now().toISOString();

    // Build phases with task instances
    const phases = PHASE_ORDER.map((phaseKey, idx) => {
      const tasks = PHASE_TASK_TEMPLATES[phaseKey].map((tpl) => ({
        id:         tpl.id,
        templateId: tpl.id,
        phase:      phaseKey,
        label:      LABELS[tpl.labelKey],
        labelKey:   tpl.labelKey,
        mandatory:  tpl.mandatory,
        status:     TASK_STATUS.PENDING,
        assignee:   null,
        dueAt:      null,
        startedAt:  null,
        completedAt:null,
        completedBy:null,
        notes:      null,
        evidence:   null,
        history:    [],
      }));
      return {
        phase: phaseKey,
        label: LABELS[phaseKey.toUpperCase()] || { he: phaseKey, en: phaseKey },
        order: idx,
        tasks,
        enteredAt: idx === 0 ? createdAt : null,
        exitedAt:  null,
        history:   [],
      };
    });

    const record = {
      id:          onboardingId,
      customerId:  String(customerId),
      product:     String(product),
      package:     String(pkg),
      owner:       String(owner),
      startDate:   start.toISOString(),
      targetGoLiveDate: target.toISOString(),
      status:      ONBOARDING_STATUS.ACTIVE,
      currentPhase: PHASES.KICKOFF,
      phases,
      meta:        meta || {},
      kickoffMeeting: null,
      requirements: {},
      configuration: {},
      trainingSessions: [],
      uatItems: [],
      goLiveItems: [],
      successMetrics: [],
      risks:       [],
      blockers:    [],
      escalations: [],
      csmId:       null,
      handedOffAt: null,
      createdAt,
      updatedAt:   createdAt,
      history:     [{
        at: createdAt,
        event: 'initiated',
        by: owner,
        note: { he: 'אונבורדינג נפתח', en: 'Onboarding initiated' },
      }],
    };

    this.store.save(record);
    this._audit(onboardingId, 'initiateOnboarding', owner, { product, package: pkg });
    return record;
  }

  // ───────────────────────────────────────────────────────────────
  // 2. kickoffMeeting — schedule & bilingual agenda
  // ───────────────────────────────────────────────────────────────
  /**
   * Schedule the kickoff meeting with a standard bilingual agenda.
   * @param {string} onboardingId
   * @param {object} [opts]
   * @param {Date|string|number} [opts.scheduledAt]  default = startDate + 1 day
   * @param {string[]}           [opts.attendees]
   * @param {number}             [opts.durationMinutes=60]
   * @returns {object} kickoff meeting record
   */
  kickoffMeeting(onboardingId, opts = {}) {
    const record = this._mustGet(onboardingId);

    const scheduledAt = opts.scheduledAt
      ? toDate(opts.scheduledAt)
      : addDays(toDate(record.startDate), 1);

    const agenda = [
      { id: 'intro',         he: 'הצגת הצוותים',                         en: 'Team introductions',                   minutes: 10 },
      { id: 'goals',         he: 'מטרות הפרויקט ותוצאות מצופות',        en: 'Project goals & expected outcomes',    minutes: 15 },
      { id: 'scope',         he: 'סקירת היקף ומוצר',                    en: 'Scope & product overview',             minutes: 10 },
      { id: 'timeline',      he: 'לוח זמנים ואבני דרך',                  en: 'Timeline & milestones',                minutes: 10 },
      { id: 'roles',         he: 'תפקידים ואחריות (RACI)',              en: 'Roles & responsibilities (RACI)',      minutes: 5  },
      { id: 'risks',         he: 'סיכונים ראשוניים',                     en: 'Initial risks',                        minutes: 5  },
      { id: 'communication', he: 'תקשורת וישיבות שבועיות',              en: 'Communication & weekly sync',          minutes: 5  },
    ];

    record.kickoffMeeting = {
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes: opts.durationMinutes || 60,
      attendees: opts.attendees || [],
      agenda,
      status: 'scheduled',
      createdAt: this.now().toISOString(),
    };

    this._completeTask(record, PHASES.KICKOFF, 'kickoff_schedule', record.owner, 'scheduled kickoff');
    this._completeTask(record, PHASES.KICKOFF, 'kickoff_agenda',  record.owner, 'agenda generated');
    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'kickoffMeeting', record.owner, { scheduledAt: scheduledAt.toISOString() });
    return record.kickoffMeeting;
  }

  // ───────────────────────────────────────────────────────────────
  // 3. collectRequirements — discovery questionnaire
  // ───────────────────────────────────────────────────────────────
  /**
   * Apply customer-provided answers to the discovery questionnaire.
   * Missing required answers leave the discovery task open.
   * @param {string} onboardingId
   * @param {object} requirements  keyed by question id
   * @returns {{answered:number, missing:string[], complete:boolean}}
   */
  collectRequirements(onboardingId, requirements = {}) {
    const record = this._mustGet(onboardingId);
    if (!requirements || typeof requirements !== 'object') {
      throw new Error('requirements must be an object');
    }

    const answered = {};
    const missing = [];
    for (const q of DISCOVERY_QUESTIONNAIRE) {
      const val = requirements[q.id];
      if (val != null && val !== '') {
        answered[q.id] = val;
      } else if (q.required) {
        missing.push(q.id);
      }
    }

    record.requirements = { ...record.requirements, ...answered };

    if (missing.length === 0) {
      this._completeTask(record, PHASES.DISCOVERY, 'discovery_questions', record.owner, 'all required answered');
    }

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'collectRequirements', record.owner, { answered: Object.keys(answered).length, missing: missing.length });

    return {
      answered: Object.keys(answered).length,
      missing,
      complete: missing.length === 0,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // 4. setupTasks — provision & migrate
  // ───────────────────────────────────────────────────────────────
  /**
   * Generate the concrete setup task plan with due-dates anchored to
   * the start date. Idempotent — re-running refreshes due dates.
   * @param {string} onboardingId
   * @returns {Array<object>} the setup tasks
   */
  setupTasks(onboardingId) {
    const record = this._mustGet(onboardingId);
    const phase = this._phase(record, PHASES.SETUP);
    const start = toDate(record.startDate);

    // Stagger tasks across the SETUP target window
    phase.tasks.forEach((task, i) => {
      const offsetDays = Math.floor((PHASE_TARGET_DAYS[PHASES.SETUP] / phase.tasks.length) * (i + 1));
      task.dueAt = addDays(start, PHASE_TARGET_DAYS[PHASES.KICKOFF] + PHASE_TARGET_DAYS[PHASES.DISCOVERY] + offsetDays).toISOString();
      if (task.status === TASK_STATUS.PENDING) {
        task.assignee = task.assignee || record.owner;
      }
    });

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'setupTasks', record.owner, { count: phase.tasks.length });
    return phase.tasks.slice();
  }

  // ───────────────────────────────────────────────────────────────
  // 5. configureProduct — per-customer customization
  // ───────────────────────────────────────────────────────────────
  /**
   * Store the concrete product configuration chosen for this customer.
   * @param {string} onboardingId
   * @param {object} config  { workflows, templates, branding, integrations, features }
   */
  configureProduct(onboardingId, config = {}) {
    const record = this._mustGet(onboardingId);
    if (!config || typeof config !== 'object') {
      throw new Error('config must be an object');
    }

    record.configuration = {
      ...record.configuration,
      ...config,
      appliedAt: this.now().toISOString(),
      appliedBy: record.owner,
    };

    // Auto-complete config tasks whose key appears in the payload
    if (config.workflows)    this._completeTask(record, PHASES.CONFIGURATION, 'config_workflows', record.owner, 'workflows applied');
    if (config.templates)    this._completeTask(record, PHASES.CONFIGURATION, 'config_templates', record.owner, 'templates applied');
    if (config.integrations) this._completeTask(record, PHASES.CONFIGURATION, 'config_integrations', record.owner, 'integrations applied');
    if (config.branding)     this._completeTask(record, PHASES.CONFIGURATION, 'config_branding',  record.owner, 'branding applied');
    if (config.features)     this._completeTask(record, PHASES.CONFIGURATION, 'config_product',   record.owner, 'features applied');

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'configureProduct', record.owner, Object.keys(config));
    return record.configuration;
  }

  // ───────────────────────────────────────────────────────────────
  // 6. trainingSessions — schedule sessions
  // ───────────────────────────────────────────────────────────────
  /**
   * Schedule one or more training sessions.
   * @param {object} arg
   * @param {string}  arg.onboardingId
   * @param {Array}   arg.participants  [{id,name,email,role}]
   * @param {Array}   arg.sessions      [{id?, title, scheduledAt, durationMinutes, trainer, mode}]
   * @returns {Array<object>} scheduled sessions
   */
  trainingSessions({ onboardingId, participants = [], sessions = [] } = {}) {
    const record = this._mustGet(onboardingId);
    if (!Array.isArray(sessions) || sessions.length === 0) {
      throw new Error('sessions[] is required');
    }
    if (!Array.isArray(participants)) {
      throw new Error('participants must be an array');
    }

    const created = sessions.map((s, i) => ({
      id:              s.id || `trn_${Date.now().toString(36)}_${i}`,
      title:           s.title || { he: 'הדרכה', en: 'Training' },
      scheduledAt:     s.scheduledAt ? toDate(s.scheduledAt).toISOString() : null,
      durationMinutes: s.durationMinutes || 90,
      trainer:         s.trainer || null,
      mode:            s.mode || 'online',  // online | onsite | hybrid
      participants:    participants.slice(),
      attendance:      [],
      materials:       s.materials || [],
      status:          'scheduled',
      createdAt:       this.now().toISOString(),
    }));

    record.trainingSessions = (record.trainingSessions || []).concat(created);

    // Mark training tasks as in-progress
    const phase = this._phase(record, PHASES.TRAINING);
    phase.tasks.forEach((t) => {
      if (t.status === TASK_STATUS.PENDING) {
        t.status = TASK_STATUS.IN_PROGRESS;
        t.startedAt = this.now().toISOString();
        t.history.push({ at: t.startedAt, from: TASK_STATUS.PENDING, to: TASK_STATUS.IN_PROGRESS, by: record.owner });
      }
    });

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'trainingSessions', record.owner, { count: created.length, participants: participants.length });
    return created;
  }

  // ───────────────────────────────────────────────────────────────
  // 7. uatChecklist — validation items
  // ───────────────────────────────────────────────────────────────
  /**
   * Initialize (if empty) or return the UAT checklist for this
   * onboarding. Items stay intact across calls — marking items passed
   * happens via `updateUatItem(id, itemId, passed, note)`.
   * @param {string} onboardingId
   * @returns {Array<object>} checklist items
   */
  uatChecklist(onboardingId) {
    const record = this._mustGet(onboardingId);
    if (!record.uatItems || record.uatItems.length === 0) {
      record.uatItems = UAT_CHECKLIST_TEMPLATE.map((t) => ({
        id:         t.id,
        he:         t.he,
        en:         t.en,
        mandatory:  t.mandatory,
        status:     TASK_STATUS.PENDING,
        checkedAt:  null,
        checkedBy:  null,
        note:       null,
        history:    [],
      }));
      this._touch(record);
      this.store.save(record);
      this._audit(onboardingId, 'uatChecklist:init', record.owner, { count: record.uatItems.length });
    }
    return record.uatItems.slice();
  }

  /**
   * Mark a single UAT item as passed or failed.
   * @param {string} onboardingId
   * @param {string} itemId
   * @param {boolean} passed
   * @param {string} [note]
   */
  updateUatItem(onboardingId, itemId, passed, note) {
    const record = this._mustGet(onboardingId);
    if (!record.uatItems || record.uatItems.length === 0) this.uatChecklist(onboardingId);
    const item = record.uatItems.find((x) => x.id === itemId);
    if (!item) throw new Error('UAT item not found: ' + itemId);

    const prev = item.status;
    item.status = passed ? TASK_STATUS.DONE : TASK_STATUS.BLOCKED;
    item.checkedAt = this.now().toISOString();
    item.checkedBy = record.owner;
    item.note = note || null;
    item.history.push({ at: item.checkedAt, from: prev, to: item.status, by: record.owner, note });

    // Propagate UAT exec completion
    const mandatoryOpen = record.uatItems.filter((x) => x.mandatory && x.status !== TASK_STATUS.DONE);
    if (mandatoryOpen.length === 0) {
      this._completeTask(record, PHASES.UAT, 'uat_exec', record.owner, 'all mandatory UAT items passed');
    }

    this._touch(record);
    this.store.save(record);
    return item;
  }

  // ───────────────────────────────────────────────────────────────
  // 8. goLiveChecklist — final gates
  // ───────────────────────────────────────────────────────────────
  /**
   * Initialize (if empty) or return the go-live gate checklist.
   * Every item with gate:true must be DONE before `finalizeGoLive`.
   * @param {string} onboardingId
   */
  goLiveChecklist(onboardingId) {
    const record = this._mustGet(onboardingId);
    if (!record.goLiveItems || record.goLiveItems.length === 0) {
      record.goLiveItems = GO_LIVE_CHECKLIST_TEMPLATE.map((t) => ({
        id:         t.id,
        he:         t.he,
        en:         t.en,
        gate:       t.gate,
        status:     TASK_STATUS.PENDING,
        checkedAt:  null,
        checkedBy:  null,
        note:       null,
        history:    [],
      }));
      this._touch(record);
      this.store.save(record);
      this._audit(onboardingId, 'goLiveChecklist:init', record.owner, { count: record.goLiveItems.length });
    }
    return record.goLiveItems.slice();
  }

  /**
   * Mark a go-live checklist item.
   */
  updateGoLiveItem(onboardingId, itemId, done, note) {
    const record = this._mustGet(onboardingId);
    if (!record.goLiveItems || record.goLiveItems.length === 0) this.goLiveChecklist(onboardingId);
    const item = record.goLiveItems.find((x) => x.id === itemId);
    if (!item) throw new Error('Go-live item not found: ' + itemId);

    const prev = item.status;
    item.status = done ? TASK_STATUS.DONE : TASK_STATUS.BLOCKED;
    item.checkedAt = this.now().toISOString();
    item.checkedBy = record.owner;
    item.note = note || null;
    item.history.push({ at: item.checkedAt, from: prev, to: item.status, by: record.owner, note });

    this._touch(record);
    this.store.save(record);
    return item;
  }

  /** All mandatory go-live gates passed? */
  goLiveReady(onboardingId) {
    const record = this._mustGet(onboardingId);
    if (!record.goLiveItems || record.goLiveItems.length === 0) this.goLiveChecklist(onboardingId);
    const openGates = record.goLiveItems.filter((x) => x.gate && x.status !== TASK_STATUS.DONE);
    return { ready: openGates.length === 0, openGates: openGates.map((g) => g.id) };
  }

  // ───────────────────────────────────────────────────────────────
  // 9. successMetrics — define success criteria
  // ───────────────────────────────────────────────────────────────
  /**
   * Define the success metrics for this onboarding. Accepts an array
   * of metric objects that override or extend DEFAULT_SUCCESS_METRICS.
   * @param {object} arg
   * @param {string} arg.onboardingId
   * @param {Array}  arg.metrics  [{id, he, en, target, unit, direction}]
   */
  successMetrics({ onboardingId, metrics = [] } = {}) {
    const record = this._mustGet(onboardingId);
    if (!Array.isArray(metrics)) {
      throw new Error('metrics must be an array');
    }

    const byId = new Map();
    // Start from defaults
    DEFAULT_SUCCESS_METRICS.forEach((m) => byId.set(m.id, { ...m, baseline: null, current: null, status: 'pending' }));
    // Overlay customer-specific
    metrics.forEach((m) => {
      if (!m.id) return;
      byId.set(m.id, {
        id:        m.id,
        he:        m.he || (byId.get(m.id) && byId.get(m.id).he) || m.id,
        en:        m.en || (byId.get(m.id) && byId.get(m.id).en) || m.id,
        target:    m.target != null ? m.target : (byId.get(m.id) && byId.get(m.id).target),
        unit:      m.unit  || (byId.get(m.id) && byId.get(m.id).unit)  || '',
        direction: m.direction || (byId.get(m.id) && byId.get(m.id).direction) || 'max',
        baseline:  m.baseline != null ? m.baseline : null,
        current:   m.current  != null ? m.current  : null,
        status:    'pending',
      });
    });

    record.successMetrics = Array.from(byId.values());
    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'successMetrics', record.owner, { count: record.successMetrics.length });
    return record.successMetrics.slice();
  }

  // ───────────────────────────────────────────────────────────────
  // 10. riskAssessment — auto-identify + return active risks
  // ───────────────────────────────────────────────────────────────
  /**
   * Scan the onboarding for known risk patterns and (optionally)
   * add fresh rows into `record.risks` — existing risks are never
   * deleted, only superseded (append-only).
   * @param {string} onboardingId
   * @returns {Array<object>} risks (active + historical)
   */
  riskAssessment(onboardingId) {
    const record = this._mustGet(onboardingId);
    const now = this.now();
    const added = [];

    // 1. Stuck-phase risk
    const stuckDays = this.daysInPhase(onboardingId);
    const threshold = PHASE_STUCK_THRESHOLD_DAYS[record.currentPhase] || 14;
    if (stuckDays > threshold) {
      const riskKey = `stuck_phase_${record.currentPhase}`;
      if (!record.risks.some((r) => r.key === riskKey && r.active)) {
        added.push({
          id:    genId('risk'),
          key:   riskKey,
          catalogId: 'stuck_phase',
          phase: record.currentPhase,
          he:    `שלב "${LABELS[record.currentPhase.toUpperCase()].he}" תקוע ${stuckDays} ימים`,
          en:    `Phase "${LABELS[record.currentPhase.toUpperCase()].en}" stuck ${stuckDays} days`,
          level: stuckDays > threshold * 2 ? RISK_LEVEL.CRITICAL : RISK_LEVEL.HIGH,
          mitigation: RISK_CATALOG.find((r) => r.id === 'stuck_phase').mitigation,
          identifiedAt: now.toISOString(),
          active: true,
          history: [],
        });
      }
    }

    // 2. Overdue tasks (trigger-based)
    for (const catalogRisk of RISK_CATALOG) {
      for (const trigger of catalogRisk.triggers) {
        const stuck = this._findStuckTask(record, trigger);
        if (stuck) {
          const riskKey = `${catalogRisk.id}_${trigger}`;
          if (!record.risks.some((r) => r.key === riskKey && r.active)) {
            added.push({
              id:    genId('risk'),
              key:   riskKey,
              catalogId: catalogRisk.id,
              phase: stuck.phase,
              he:    catalogRisk.he,
              en:    catalogRisk.en,
              level: catalogRisk.defaultLevel,
              mitigation: catalogRisk.mitigation,
              identifiedAt: now.toISOString(),
              active: true,
              history: [],
            });
          }
        }
      }
    }

    // 3. Missing required discovery answers → missing_sme risk hint
    if (record.requirements) {
      const missingReq = DISCOVERY_QUESTIONNAIRE
        .filter((q) => q.required && (record.requirements[q.id] == null || record.requirements[q.id] === ''));
      if (missingReq.length >= 5) {
        const riskKey = 'discovery_gaps';
        if (!record.risks.some((r) => r.key === riskKey && r.active)) {
          added.push({
            id:    genId('risk'),
            key:   riskKey,
            catalogId: 'missing_sme',
            phase: PHASES.DISCOVERY,
            he:    `חוסר במידע בסיסי (${missingReq.length} שאלות פתוחות)`,
            en:    `Discovery gaps (${missingReq.length} open questions)`,
            level: RISK_LEVEL.MEDIUM,
            mitigation: RISK_CATALOG.find((r) => r.id === 'missing_sme').mitigation,
            identifiedAt: now.toISOString(),
            active: true,
            history: [],
          });
        }
      }
    }

    if (added.length) {
      record.risks = record.risks.concat(added);
      this._touch(record);
      this.store.save(record);
      this._audit(onboardingId, 'riskAssessment', record.owner, { added: added.length });
    }

    return record.risks.slice();
  }

  // ───────────────────────────────────────────────────────────────
  // 11. blockerEscalation — escalation workflow
  // ───────────────────────────────────────────────────────────────
  /**
   * Raise a blocker and escalate it up the ladder. Escalation level
   * is derived from existing open blockers for this record (each
   * new one bumps one level). Existing escalations are preserved
   * (append-only).
   * @param {string} onboardingId
   * @param {object} [blocker] { title, description, severity, reporter }
   */
  blockerEscalation(onboardingId, blocker = {}) {
    const record = this._mustGet(onboardingId);
    const now = this.now();

    // Count active blockers to determine escalation tier
    const activeBlockers = (record.blockers || []).filter((b) => b.active);
    const newBlocker = {
      id:          genId('blk'),
      title:       blocker.title || { he: 'חסם חדש', en: 'New blocker' },
      description: blocker.description || null,
      severity:    blocker.severity || RISK_LEVEL.MEDIUM,
      reporter:    blocker.reporter || record.owner,
      reportedAt:  now.toISOString(),
      phase:       record.currentPhase,
      active:      true,
      resolvedAt:  null,
      history:     [],
    };
    record.blockers = (record.blockers || []).concat([newBlocker]);

    // Escalation ladder — auto-step-up based on severity + blocker count
    let level;
    const sev = newBlocker.severity;
    if (sev === RISK_LEVEL.CRITICAL) {
      level = ESCALATION_LEVEL.L4_EXEC;
    } else if (sev === RISK_LEVEL.HIGH || activeBlockers.length >= 2) {
      level = ESCALATION_LEVEL.L3_DIR;
    } else if (sev === RISK_LEVEL.MEDIUM || activeBlockers.length >= 1) {
      level = ESCALATION_LEVEL.L2_LEAD;
    } else {
      level = ESCALATION_LEVEL.L1_OWNER;
    }

    const escalation = {
      id:          genId('esc'),
      blockerId:   newBlocker.id,
      level,
      he:          this._escalationLabelHe(level),
      en:          this._escalationLabelEn(level),
      raisedAt:    now.toISOString(),
      raisedBy:    newBlocker.reporter,
      resolvedAt:  null,
      resolution:  null,
      history:     [],
    };
    record.escalations = (record.escalations || []).concat([escalation]);

    // Mark onboarding as escalated if level >= L2
    if (level !== ESCALATION_LEVEL.L1_OWNER && record.status === ONBOARDING_STATUS.ACTIVE) {
      record.status = ONBOARDING_STATUS.ESCALATED;
    }

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'blockerEscalation', newBlocker.reporter, { level, severity: sev });

    return { blocker: newBlocker, escalation };
  }

  _escalationLabelHe(level) {
    switch (level) {
      case ESCALATION_LEVEL.L1_OWNER: return 'אחראי אונבורדינג';
      case ESCALATION_LEVEL.L2_LEAD:  return 'ראש צוות הצלחת לקוח';
      case ESCALATION_LEVEL.L3_DIR:   return 'מנהל/ת הצלחת לקוח';
      case ESCALATION_LEVEL.L4_EXEC:  return 'הנהלה / ועדת היגוי';
      default: return 'ללא';
    }
  }
  _escalationLabelEn(level) {
    switch (level) {
      case ESCALATION_LEVEL.L1_OWNER: return 'Onboarding owner';
      case ESCALATION_LEVEL.L2_LEAD:  return 'CS team lead';
      case ESCALATION_LEVEL.L3_DIR:   return 'CS director';
      case ESCALATION_LEVEL.L4_EXEC:  return 'Executive / steering committee';
      default: return 'None';
    }
  }

  // ───────────────────────────────────────────────────────────────
  // 12. daysInPhase — stuck detection
  // ───────────────────────────────────────────────────────────────
  /**
   * Number of days the onboarding has been in its current phase
   * relative to the injected clock.
   */
  daysInPhase(onboardingId) {
    const record = this._mustGet(onboardingId);
    const phase = this._phase(record, record.currentPhase);
    const enteredAt = phase.enteredAt ? toDate(phase.enteredAt) : toDate(record.createdAt);
    return daysBetween(enteredAt, this.now());
  }

  // ───────────────────────────────────────────────────────────────
  // 13. onboardingHealth — green/yellow/red
  // ───────────────────────────────────────────────────────────────
  /**
   * Return an overall health scorecard:
   *   - RED if any critical risk, ≥1 L3+ escalation, stuck > 2x threshold,
   *     or go-live missed
   *   - YELLOW if any high risk, overdue mandatory task, or
   *     stuck > threshold
   *   - GREEN otherwise
   */
  onboardingHealth(onboardingId) {
    const record = this._mustGet(onboardingId);
    const stuckDays = this.daysInPhase(onboardingId);
    const threshold = PHASE_STUCK_THRESHOLD_DAYS[record.currentPhase] || 14;
    const activeRisks = record.risks.filter((r) => r.active);
    const criticalRisks = activeRisks.filter((r) => r.level === RISK_LEVEL.CRITICAL);
    const highRisks = activeRisks.filter((r) => r.level === RISK_LEVEL.HIGH);
    const activeEsc = (record.escalations || []).filter((e) => !e.resolvedAt);
    const highEsc = activeEsc.filter((e) =>
      e.level === ESCALATION_LEVEL.L3_DIR || e.level === ESCALATION_LEVEL.L4_EXEC);

    // Go-live slip — past target date and not yet completed
    const nowT = this.now().getTime();
    const targetT = toDate(record.targetGoLiveDate).getTime();
    const goLiveMissed = nowT > targetT
      && record.currentPhase !== PHASES.REVIEW_30D
      && record.status !== ONBOARDING_STATUS.COMPLETED
      && record.status !== ONBOARDING_STATUS.HANDED_OFF;

    // Overdue mandatory task?
    let overdueTask = false;
    for (const ph of record.phases) {
      for (const t of ph.tasks) {
        if (!t.mandatory) continue;
        if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.SKIPPED || t.status === TASK_STATUS.CANCELLED) continue;
        if (t.dueAt && toDate(t.dueAt).getTime() < nowT) {
          overdueTask = true;
          break;
        }
      }
      if (overdueTask) break;
    }

    const reasons = [];
    let color = HEALTH.GREEN;

    if (criticalRisks.length) {
      color = HEALTH.RED;
      reasons.push({ code: 'critical_risk', count: criticalRisks.length });
    }
    if (highEsc.length) {
      color = HEALTH.RED;
      reasons.push({ code: 'high_escalation', count: highEsc.length });
    }
    if (stuckDays > threshold * 2) {
      color = HEALTH.RED;
      reasons.push({ code: 'severely_stuck', stuckDays, threshold });
    }
    if (goLiveMissed) {
      color = HEALTH.RED;
      reasons.push({ code: 'go_live_missed' });
    }

    if (color !== HEALTH.RED) {
      if (highRisks.length) {
        color = HEALTH.YELLOW;
        reasons.push({ code: 'high_risk', count: highRisks.length });
      }
      if (stuckDays > threshold) {
        color = HEALTH.YELLOW;
        reasons.push({ code: 'stuck', stuckDays, threshold });
      }
      if (overdueTask) {
        color = HEALTH.YELLOW;
        reasons.push({ code: 'overdue_task' });
      }
      if (activeEsc.length) {
        color = color === HEALTH.YELLOW ? HEALTH.YELLOW : HEALTH.YELLOW;
        reasons.push({ code: 'open_escalation', count: activeEsc.length });
      }
    }

    return {
      color,
      label: LABELS[color.toUpperCase()],
      stuckDays,
      phase: record.currentPhase,
      reasons,
      activeRisks: activeRisks.length,
      activeBlockers: (record.blockers || []).filter((b) => b.active).length,
      activeEscalations: activeEsc.length,
      computedAt: this.now().toISOString(),
    };
  }

  // ───────────────────────────────────────────────────────────────
  // 14. handoffToSuccess — transition to CSM
  // ───────────────────────────────────────────────────────────────
  /**
   * Transition the onboarding to ongoing success management.
   * Preconditions: all GO_LIVE tasks complete and REVIEW_30D phase
   * reached (or forced with opts.force = true).
   * Never deletes the record — status flips to HANDED_OFF and csmId
   * is stamped.
   * @param {string} onboardingId
   * @param {string} csmId  target CSM user id
   * @param {object} [opts] { force?: boolean }
   */
  handoffToSuccess(onboardingId, csmId, opts = {}) {
    if (!csmId) throw new Error('csmId is required');
    const record = this._mustGet(onboardingId);

    // Preconditions: 30-day review phase complete, go-live tasks done
    const reviewPhase = this._phase(record, PHASES.REVIEW_30D);
    const mandatoryOpen = reviewPhase.tasks.filter((t) => t.mandatory && t.status !== TASK_STATUS.DONE);

    const goLivePhase = this._phase(record, PHASES.GO_LIVE);
    const goLiveOpen = goLivePhase.tasks.filter((t) => t.mandatory && t.status !== TASK_STATUS.DONE);

    if (!opts.force && (mandatoryOpen.length > 0 || goLiveOpen.length > 0)) {
      throw new Error('Cannot handoff: open mandatory tasks (' +
        'goLive=' + goLiveOpen.length + ', review=' + mandatoryOpen.length + ')');
    }

    this._completeTask(record, PHASES.REVIEW_30D, 'review_handoff', record.owner, 'handoff to CSM');

    record.csmId = String(csmId);
    record.handedOffAt = this.now().toISOString();
    record.status = ONBOARDING_STATUS.HANDED_OFF;
    record.history.push({
      at:    record.handedOffAt,
      event: 'handed_off',
      by:    record.owner,
      csmId: record.csmId,
      note:  { he: 'הועבר לניהול הצלחת לקוח', en: 'Transitioned to customer success management' },
    });

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'handoffToSuccess', record.owner, { csmId });

    return {
      onboardingId: record.id,
      csmId: record.csmId,
      handedOffAt: record.handedOffAt,
      status: record.status,
    };
  }

  // ───────────────────────────────────────────────────────────────
  // PHASE PROGRESSION  — advance through the pipeline
  // ───────────────────────────────────────────────────────────────
  /**
   * Attempt to advance to the next phase. Requires all mandatory
   * tasks in the current phase to be DONE (unless force=true).
   * Never deletes — the completed phase is stamped with exitedAt and
   * a history entry.
   */
  advancePhase(onboardingId, opts = {}) {
    const record = this._mustGet(onboardingId);
    const cur = this._phase(record, record.currentPhase);
    const open = cur.tasks.filter((t) => t.mandatory
      && t.status !== TASK_STATUS.DONE
      && t.status !== TASK_STATUS.SKIPPED);

    if (!opts.force && open.length > 0) {
      throw new Error('Cannot advance: ' + open.length + ' mandatory task(s) open in phase ' + cur.phase);
    }

    const nxt = nextPhase(cur.phase);
    if (!nxt) {
      // Already at final phase — mark completed
      record.status = ONBOARDING_STATUS.COMPLETED;
      record.history.push({
        at: this.now().toISOString(),
        event: 'completed',
        by: record.owner,
      });
      this._touch(record);
      this.store.save(record);
      return record;
    }

    cur.exitedAt = this.now().toISOString();
    cur.history.push({ at: cur.exitedAt, event: 'exited', by: record.owner });

    const nxtPhase = this._phase(record, nxt);
    nxtPhase.enteredAt = this.now().toISOString();
    nxtPhase.history.push({ at: nxtPhase.enteredAt, event: 'entered', by: record.owner });

    record.currentPhase = nxt;
    record.history.push({
      at: nxtPhase.enteredAt,
      event: 'phase_changed',
      from: cur.phase,
      to: nxt,
      by: record.owner,
    });

    this._touch(record);
    this.store.save(record);
    this._audit(onboardingId, 'advancePhase', record.owner, { from: cur.phase, to: nxt });
    return record;
  }

  /**
   * Mark a task complete.
   */
  completeTask(onboardingId, phase, taskId, by, note) {
    const record = this._mustGet(onboardingId);
    this._completeTask(record, phase, taskId, by || record.owner, note);
    this._touch(record);
    this.store.save(record);
    return record;
  }

  /**
   * Retrieve a record by id.
   */
  getOnboarding(onboardingId) {
    return this.store.get(onboardingId);
  }

  // ───────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ───────────────────────────────────────────────────────────────

  _mustGet(id) {
    const r = this.store.get(id);
    if (!r) throw new Error('Onboarding not found: ' + id);
    return r;
  }

  _phase(record, phaseKey) {
    const p = record.phases.find((x) => x.phase === phaseKey);
    if (!p) throw new Error('Phase missing from record: ' + phaseKey);
    return p;
  }

  _completeTask(record, phaseKey, taskId, by, note) {
    const phase = this._phase(record, phaseKey);
    const task = phase.tasks.find((t) => t.id === taskId);
    if (!task) return null;
    if (task.status === TASK_STATUS.DONE) return task;

    const at = this.now().toISOString();
    task.history.push({ at, from: task.status, to: TASK_STATUS.DONE, by, note });
    task.status = TASK_STATUS.DONE;
    task.completedAt = at;
    task.completedBy = by;
    if (!task.startedAt) task.startedAt = at;
    return task;
  }

  _findStuckTask(record, taskId) {
    // Find a task across phases that is overdue (past dueAt and not done)
    const nowT = this.now().getTime();
    for (const ph of record.phases) {
      const t = ph.tasks.find((x) => x.id === taskId);
      if (!t) continue;
      if (t.status === TASK_STATUS.DONE || t.status === TASK_STATUS.SKIPPED) return null;
      if (t.dueAt && toDate(t.dueAt).getTime() < nowT) return t;
      // Or if the task belongs to the current phase and we're past the phase threshold
      if (ph.phase === record.currentPhase) {
        const daysHere = this.daysInPhase(record.id);
        const threshold = PHASE_STUCK_THRESHOLD_DAYS[record.currentPhase] || 14;
        if (daysHere > threshold) return t;
      }
    }
    return null;
  }

  _touch(record) {
    record.updatedAt = this.now().toISOString();
  }

  _audit(onboardingId, action, actor, payload) {
    const entry = {
      at: this.now().toISOString(),
      onboardingId,
      action,
      actor,
      payload: payload || null,
    };
    this.audit.push(entry);
    if (this.logger && this.logger.info) {
      try { this.logger.info('customer-onboarding', entry); } catch (_) { /* swallow */ }
    }
    return entry;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  CustomerOnboarding,
  PHASES,
  PHASE_ORDER,
  TASK_STATUS,
  ONBOARDING_STATUS,
  HEALTH,
  RISK_LEVEL,
  ESCALATION_LEVEL,
  LABELS,
  PHASE_TASK_TEMPLATES,
  DISCOVERY_QUESTIONNAIRE,
  UAT_CHECKLIST_TEMPLATE,
  GO_LIVE_CHECKLIST_TEMPLATE,
  DEFAULT_SUCCESS_METRICS,
  RISK_CATALOG,
  PHASE_STUCK_THRESHOLD_DAYS,
  PHASE_TARGET_DAYS,
  createMemoryStore,
  computeCurrentPhase,
  phaseIndex,
  nextPhase,
};
