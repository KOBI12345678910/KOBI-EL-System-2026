/**
 * Quarterly Business Review (QBR) Generator — מחולל סקירה עסקית רבעונית
 * ======================================================================
 *
 * Agent Y-104  •  Swarm Customer Success  •  Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency bilingual QBR generator. Aggregates usage, billing,
 * support, health-score, success-plan and roadmap data from every
 * module of the ERP and produces a Palantir-themed bilingual PDF /
 * slide deck / one-pager ready for the CSM to walk an executive
 * sponsor through the quarter.
 *
 * Rule of the ERP: לא מוחקים רק משדרגים ומגדלים
 * ----------------------------------------------
 * QBRs are append-only records. Each call to `generateQBR` creates a
 * new `qbrId`; existing QBRs are never overwritten, never deleted —
 * only superseded (status → SUPERSEDED). Commitments, follow-ups,
 * next-QBR schedules all live in history arrays, so the full trail
 * of what a customer asked for and what we promised is always
 * recoverable years later.
 *
 * Bilingual: every section, KPI, status, commitment, action item
 * ships with `{ he, en }` so the rendered deck can be flipped into
 * Hebrew-RTL or English-LTR without re-assembly.
 *
 * Zero deps: only Node built-ins (`node:crypto`). The "PDF" and
 * "slide deck" outputs are structured JSON payloads + a pure-text
 * PDF byte stream — a downstream renderer (pdfkit, pptxgenjs) can
 * turn either into a real binary, but the generator itself has no
 * third-party dependency.
 *
 * ----------------------------------------------------------------
 * PUBLIC API
 * ----------------------------------------------------------------
 *   class  QBRGenerator
 *     • generateQBR({ customerId, quarter, sections? })  → qbrRecord
 *     • pullData(customerId, quarter)                    → dataBundle
 *     • executiveSponsor(customerId)                     → sponsor
 *     • generatePDF(qbrId)                               → pdfPayload
 *     • generateSlides(qbrId)                            → slidePayload
 *     • prepMaterials(qbrId)                             → prepOnePager
 *     • trackCommitments(qbrId, commitments?)            → commitments[]
 *     • followUpActions(qbrId, actions?)                 → actions[]
 *     • scheduleNextQBR(qbrId)                           → schedule
 *
 *   const  SECTIONS            — canonical section ids
 *   const  SECTION_ORDER       — default render order
 *   const  HEALTH_BAND         — thresholds
 *   const  COMMITMENT_STATUS   — lifecycle
 *   const  GOAL_STATUS         — achieved / in_progress / at_risk / blocked
 *   const  LABELS              — bilingual label dictionary
 *   const  PALANTIR_THEME      — colour + typography tokens
 *   function createMemoryStore()
 *   function createStubModules() — returns a stub for every data source
 *   function normalizeQuarter(q) — string/obj → { year, q, label }
 *   function computeHealthScore(metrics) — 0..100
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** QBR section ids — every section is optional but has a stable key */
const SECTIONS = Object.freeze({
  EXECUTIVE_SUMMARY:   'executive_summary',
  USAGE_METRICS:       'usage_metrics',
  BUSINESS_IMPACT:     'business_impact',
  SUPPORT_SUMMARY:     'support_summary',
  HEALTH_SCORE:        'health_score',
  GOALS:               'goals',
  EXPANSION:           'expansion',
  ROADMAP:             'roadmap',
  KNOWN_ISSUES:        'known_issues',
  ASKS_COMMITMENTS:    'asks_commitments',
  NEXT_QUARTER_GOALS:  'next_quarter_goals',
});

const SECTION_ORDER = Object.freeze([
  SECTIONS.EXECUTIVE_SUMMARY,
  SECTIONS.USAGE_METRICS,
  SECTIONS.BUSINESS_IMPACT,
  SECTIONS.SUPPORT_SUMMARY,
  SECTIONS.HEALTH_SCORE,
  SECTIONS.GOALS,
  SECTIONS.EXPANSION,
  SECTIONS.ROADMAP,
  SECTIONS.KNOWN_ISSUES,
  SECTIONS.ASKS_COMMITMENTS,
  SECTIONS.NEXT_QUARTER_GOALS,
]);

/**
 * Standard 10-section deck layout used by `buildSlide` / `renderHTML` /
 * `renderPDF`. Kept separate from the legacy `SECTIONS` map so both APIs
 * coexist (we upgrade, never delete).
 */
const SLIDE_SECTIONS = Object.freeze({
  EXECUTIVE_SUMMARY:   'executive-summary',
  GOAL_PROGRESS:       'goal-progress',
  USAGE_METRICS:       'usage-metrics',
  VALUE_DELIVERED:     'value-delivered',
  ROI_ANALYSIS:        'roi-analysis',
  SUPPORT_SUMMARY:     'support-summary',
  NPS_CSAT:            'nps-csat',
  ROADMAP_PREVIEW:     'roadmap-preview',
  ASKS_FROM_CUSTOMER:  'asks-from-customer',
  NEXT_STEPS:          'next-steps',
});

const SLIDE_SECTION_ORDER = Object.freeze([
  SLIDE_SECTIONS.EXECUTIVE_SUMMARY,
  SLIDE_SECTIONS.GOAL_PROGRESS,
  SLIDE_SECTIONS.USAGE_METRICS,
  SLIDE_SECTIONS.VALUE_DELIVERED,
  SLIDE_SECTIONS.ROI_ANALYSIS,
  SLIDE_SECTIONS.SUPPORT_SUMMARY,
  SLIDE_SECTIONS.NPS_CSAT,
  SLIDE_SECTIONS.ROADMAP_PREVIEW,
  SLIDE_SECTIONS.ASKS_FROM_CUSTOMER,
  SLIDE_SECTIONS.NEXT_STEPS,
]);

/** Bilingual titles for the 10 standard slides. */
const SLIDE_TITLES = Object.freeze({
  'executive-summary':  { he: 'תקציר מנהלים',            en: 'Executive Summary' },
  'goal-progress':      { he: 'התקדמות יעדים',            en: 'Goal Progress' },
  'usage-metrics':      { he: 'מדדי שימוש',               en: 'Usage Metrics' },
  'value-delivered':    { he: 'ערך שנמסר',                en: 'Value Delivered' },
  'roi-analysis':       { he: 'ניתוח ROI',                en: 'ROI Analysis' },
  'support-summary':    { he: 'סיכום תמיכה',              en: 'Support Summary' },
  'nps-csat':           { he: 'NPS ושביעות רצון',         en: 'NPS & CSAT' },
  'roadmap-preview':    { he: 'תצוגה מקדימה — מפת דרכים', en: 'Roadmap Preview' },
  'asks-from-customer': { he: 'בקשות מהלקוח',             en: 'Asks from Customer' },
  'next-steps':         { he: 'צעדים הבאים',              en: 'Next Steps' },
});

/** Recommendation rule keys. */
const RECOMMENDATION_RULES = Object.freeze({
  ADVOCACY:      'advocacy',
  TRAINING:      'training',
  HEALTH_CHECK:  'health-check',
  RENEWAL:       'renewal',
});

/** Health-score bands */
const HEALTH_BAND = Object.freeze({
  HEALTHY:  { min: 80, key: 'healthy',  he: 'בריא',     en: 'Healthy',  color: '#00b37e' },
  NEUTRAL:  { min: 60, key: 'neutral',  he: 'ניטרלי',   en: 'Neutral',  color: '#f2a900' },
  AT_RISK:  { min: 40, key: 'at_risk',  he: 'בסיכון',   en: 'At risk',  color: '#ff6a00' },
  CRITICAL: { min: 0,  key: 'critical', he: 'קריטי',    en: 'Critical', color: '#d22b2b' },
});

/** QBR-record lifecycle */
const QBR_STATUS = Object.freeze({
  DRAFT:      'draft',
  ASSEMBLED:  'assembled',
  DELIVERED:  'delivered',
  SUPERSEDED: 'superseded',   // never deleted — only superseded
  ARCHIVED:   'archived',     // never deleted — archived record preserved
});

/** Commitment lifecycle — append-only history */
const COMMITMENT_STATUS = Object.freeze({
  OPEN:       'open',
  IN_PROGRESS: 'in_progress',
  DONE:       'done',
  BLOCKED:    'blocked',
  DEFERRED:   'deferred',  // ≠ deleted, history kept
});

/** Success-plan goal statuses */
const GOAL_STATUS = Object.freeze({
  ACHIEVED:    'achieved',
  IN_PROGRESS: 'in_progress',
  AT_RISK:     'at_risk',
  BLOCKED:     'blocked',
  DEFERRED:    'deferred',
});

/** Action-item party */
const ACTION_OWNER = Object.freeze({
  VENDOR:   'vendor',    // us (Techno-Kol / Onyx)
  CUSTOMER: 'customer',
  JOINT:    'joint',
});

const MS_PER_DAY = 86_400_000;

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS
// ═══════════════════════════════════════════════════════════════════

const LABELS = Object.freeze({
  // Document title
  QBR_TITLE:        { he: 'סקירה עסקית רבעונית', en: 'Quarterly Business Review' },

  // Section labels
  EXECUTIVE_SUMMARY: { he: 'תקציר מנהלים',          en: 'Executive Summary' },
  USAGE_METRICS:     { he: 'מדדי שימוש',             en: 'Usage Metrics' },
  BUSINESS_IMPACT:   { he: 'השפעה עסקית',            en: 'Business Impact' },
  SUPPORT_SUMMARY:   { he: 'סיכום תמיכה',            en: 'Support Summary' },
  HEALTH_SCORE:      { he: 'ציון בריאות חשבון',     en: 'Account Health Score' },
  GOALS:             { he: 'יעדים מתוכנית ההצלחה',  en: 'Goals (Success Plan)' },
  EXPANSION:         { he: 'הזדמנויות הרחבה',        en: 'Expansion & Upsell' },
  ROADMAP:           { he: 'מפת הדרכים',             en: 'Roadmap' },
  KNOWN_ISSUES:      { he: 'בעיות ידועות',           en: 'Known Issues / Open Items' },
  ASKS_COMMITMENTS:  { he: 'בקשות והתחייבויות',     en: 'Asks & Commitments' },
  NEXT_QUARTER_GOALS: { he: 'יעדי הרבעון הבא',      en: 'Next Quarter Goals' },

  // KPIs
  LOGINS:            { he: 'כניסות למערכת',          en: 'Logins' },
  ACTIVE_USERS:      { he: 'משתמשים פעילים',        en: 'Active users' },
  FEATURES_USED:     { he: 'פיצ\'רים בשימוש',       en: 'Features used' },
  VALUE_DELIVERED:   { he: 'ערך שנמסר',              en: 'Value delivered' },
  ROI:               { he: 'החזר השקעה',             en: 'ROI' },
  TICKETS_OPENED:    { he: 'פניות נפתחו',            en: 'Tickets opened' },
  TICKETS_CLOSED:    { he: 'פניות נסגרו',            en: 'Tickets closed' },
  AVG_RESOLUTION:    { he: 'זמן טיפול ממוצע',        en: 'Avg. resolution' },
  CSAT:              { he: 'שביעות רצון',            en: 'CSAT' },
  NPS:               { he: 'NPS',                    en: 'NPS' },
  MRR:               { he: 'הכנסה חודשית קבועה',    en: 'MRR' },
  ARR:               { he: 'הכנסה שנתית קבועה',     en: 'ARR' },

  // Status words
  HEALTHY:           { he: 'בריא',                   en: 'Healthy' },
  NEUTRAL:           { he: 'ניטרלי',                 en: 'Neutral' },
  AT_RISK:           { he: 'בסיכון',                 en: 'At risk' },
  CRITICAL:          { he: 'קריטי',                  en: 'Critical' },
  ACHIEVED:          { he: 'הושג',                   en: 'Achieved' },
  IN_PROGRESS:       { he: 'בתהליך',                 en: 'In progress' },
  BLOCKED:           { he: 'חסום',                   en: 'Blocked' },
  DEFERRED:          { he: 'נדחה',                   en: 'Deferred' },
  OPEN:              { he: 'פתוח',                   en: 'Open' },
  DONE:              { he: 'הושלם',                  en: 'Done' },

  // Sponsor
  EXEC_SPONSOR:      { he: 'נאמן בכיר',              en: 'Executive sponsor' },
  ACCOUNT_OWNER:     { he: 'מנהל לקוח',              en: 'Account owner' },
  CSM:               { he: 'מנהל הצלחת לקוח',        en: 'Customer success manager' },

  // Prep / follow-up
  PREP_SHEET:        { he: 'דף הכנה למפגש',          en: 'Prep one-pager' },
  NEXT_QBR:          { he: 'QBR הבא',                en: 'Next QBR' },
  ACTION_ITEMS:      { he: 'משימות המשך',            en: 'Follow-up actions' },
  COMMITMENTS:       { he: 'התחייבויות',             en: 'Commitments' },
  OWNER:             { he: 'אחראי',                  en: 'Owner' },
  DUE:               { he: 'מועד יעד',               en: 'Due' },
});

// ═══════════════════════════════════════════════════════════════════
// PALANTIR THEME TOKENS
// ═══════════════════════════════════════════════════════════════════

const PALANTIR_THEME = Object.freeze({
  colors: Object.freeze({
    bg:            '#0b0f17',   // near-black navy
    surface:       '#101623',
    surfaceAlt:    '#162031',
    border:        '#1f2b3e',
    text:          '#e6edf6',
    textMuted:     '#9aa8bf',
    accent:        '#1f8bff',   // signature blue
    accentAlt:     '#00d1b2',
    success:       '#00b37e',
    warning:       '#f2a900',
    danger:        '#d22b2b',
    gridline:      '#22304a',
  }),
  fonts: Object.freeze({
    he:            'Rubik, Heebo, Arial Hebrew, Arial, sans-serif',
    en:            'Inter, "IBM Plex Sans", Helvetica, Arial, sans-serif',
    mono:          '"IBM Plex Mono", "JetBrains Mono", monospace',
  }),
  type: Object.freeze({
    displayPt:     32,
    h1Pt:          22,
    h2Pt:          18,
    bodyPt:        11,
    smallPt:       9,
  }),
  layout: Object.freeze({
    pageSize:      'A4',
    marginPt:      48,
    gutterPt:      12,
  }),
});

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Normalise a quarter token to { year, q, label, start, end }.
 * Accepts: "2026-Q1", "Q1-2026", "2026Q1", { year, q }, or a Date.
 */
function normalizeQuarter(q) {
  if (q == null) throw new Error('quarter is required');
  let year, qNum;

  if (typeof q === 'object' && !(q instanceof Date) && q.year != null && q.q != null) {
    year = Number(q.year);
    qNum = Number(q.q);
  } else if (q instanceof Date) {
    year = q.getUTCFullYear();
    qNum = Math.floor(q.getUTCMonth() / 3) + 1;
  } else if (typeof q === 'string') {
    const m = q.match(/^(\d{4})[-\s]?Q([1-4])$/i) || q.match(/^Q([1-4])[-\s]?(\d{4})$/i);
    if (!m) throw new Error(`invalid quarter token: ${q}`);
    if (m[0].toUpperCase().startsWith('Q')) {
      qNum = Number(m[1]); year = Number(m[2]);
    } else {
      year = Number(m[1]); qNum = Number(m[2]);
    }
  } else {
    throw new Error(`invalid quarter: ${q}`);
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`invalid quarter year: ${year}`);
  }
  if (!Number.isInteger(qNum) || qNum < 1 || qNum > 4) {
    throw new Error(`invalid quarter number: ${qNum}`);
  }

  const startMonth = (qNum - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end   = new Date(Date.UTC(year, startMonth + 3, 1) - 1);
  const label = `${year}-Q${qNum}`;
  return { year, q: qNum, label, start, end };
}

/** Compute a health band from a 0..100 score. */
function bandOf(score) {
  if (score >= HEALTH_BAND.HEALTHY.min)  return HEALTH_BAND.HEALTHY;
  if (score >= HEALTH_BAND.NEUTRAL.min)  return HEALTH_BAND.NEUTRAL;
  if (score >= HEALTH_BAND.AT_RISK.min)  return HEALTH_BAND.AT_RISK;
  return HEALTH_BAND.CRITICAL;
}

/**
 * Compute 0..100 health score from weighted signals.
 * Inputs (all optional; missing → contributes the band midpoint).
 *   usage, sentiment, support, financial, adoption, sponsorship ∈ [0..100]
 */
function computeHealthScore(metrics = {}) {
  const weights = {
    usage:       0.25,
    sentiment:   0.15,
    support:     0.15,
    financial:   0.20,
    adoption:    0.15,
    sponsorship: 0.10,
  };
  let total = 0;
  let wSum  = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = typeof metrics[k] === 'number' ? clamp(metrics[k], 0, 100) : null;
    if (v == null) continue;
    total += v * w;
    wSum  += w;
  }
  if (wSum === 0) return 0;
  return Math.round(total / wSum);
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number(n) || 0)); }

/** Deterministic hash id for a QBR key so tests are reproducible. */
function qbrIdFor(customerId, quarterLabel) {
  const h = crypto.createHash('sha1')
    .update(`qbr:${customerId}:${quarterLabel}`)
    .digest('hex').slice(0, 16);
  return `QBR-${quarterLabel}-${h}`;
}

function shortId(prefix = 'ID') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function pct(num, den, digits = 1) {
  if (!den) return 0;
  return +((num / den) * 100).toFixed(digits);
}

function sum(arr, sel = (x) => x) {
  return arr.reduce((a, b) => a + (Number(sel(b)) || 0), 0);
}

function avg(arr, sel = (x) => x) {
  return arr.length ? sum(arr, sel) / arr.length : 0;
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY STORE  (append-only — no delete methods)
// ═══════════════════════════════════════════════════════════════════

/**
 * createMemoryStore
 * Intentionally has NO delete / remove / clear method so the
 * never-delete rule is structurally enforced.
 */
function createMemoryStore() {
  const qbrs = new Map();
  const commitments = new Map();    // qbrId → Commitment[]
  const actions = new Map();        // qbrId → Action[]
  const schedules = new Map();      // qbrId → schedule
  const dataCache = new Map();      // key → pulled data bundle

  return {
    saveQBR(record) {
      if (!record || !record.id) throw new Error('record.id required');
      qbrs.set(record.id, record);
      return record;
    },
    getQBR(id) { return qbrs.get(id) || null; },
    listQBRs(customerId) {
      const out = [];
      for (const r of qbrs.values()) {
        if (!customerId || r.customerId === customerId) out.push(r);
      }
      return out;
    },

    appendCommitment(qbrId, commitment) {
      if (!commitments.has(qbrId)) commitments.set(qbrId, []);
      commitments.get(qbrId).push(commitment);
      return commitment;
    },
    listCommitments(qbrId) {
      return (commitments.get(qbrId) || []).slice();
    },
    updateCommitmentStatus(qbrId, commitmentId, status, note, by) {
      const list = commitments.get(qbrId) || [];
      const c = list.find((x) => x.id === commitmentId);
      if (!c) return null;
      c.history.push({ at: new Date().toISOString(), status, note: note || null, by: by || null });
      c.status = status;
      return c;
    },

    appendAction(qbrId, action) {
      if (!actions.has(qbrId)) actions.set(qbrId, []);
      actions.get(qbrId).push(action);
      return action;
    },
    listActions(qbrId) {
      return (actions.get(qbrId) || []).slice();
    },

    setSchedule(qbrId, schedule) {
      schedules.set(qbrId, schedule);
      return schedule;
    },
    getSchedule(qbrId) { return schedules.get(qbrId) || null; },

    cachePull(key, bundle) { dataCache.set(key, bundle); return bundle; },
    getCachedPull(key) { return dataCache.get(key) || null; },
  };
}

// ═══════════════════════════════════════════════════════════════════
// STUB MODULE SOURCES
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns a stub set of module adapters so `new QBRGenerator()` works
 * out of the box for tests / smoke runs. A real deployment passes in
 * the wired modules via the constructor.
 */
function createStubModules() {
  return {
    billing:  { getQuarter: () => null, getExpansionOpportunities: () => [] },
    usage:    { getQuarter: () => null },
    support:  { getQuarter: () => null },
    health:   { getSnapshot: () => null },
    success:  { getPlan: () => null },
    roadmap:  { getItemsFor: () => [] },
    issues:   { getOpenFor: () => [] },
    customers: { getCustomer: () => null, getExecSponsor: () => null },
  };
}

// ═══════════════════════════════════════════════════════════════════
// QBRGenerator — CLASS
// ═══════════════════════════════════════════════════════════════════

class QBRGenerator {
  /**
   * @param {object}   options
   * @param {object}  [options.store]       — append-only store
   * @param {object}  [options.modules]     — data-source adapters
   * @param {Function}[options.now]         — clock injector
   * @param {object}  [options.theme]       — override Palantir theme
   * @param {object}  [options.logger]      — optional logger
   */
  constructor(options = {}) {
    this.store = options.store || createMemoryStore();
    this.modules = Object.assign(createStubModules(), options.modules || {});
    this.now = options.now || (() => new Date());
    this.theme = options.theme || PALANTIR_THEME;
    this.logger = options.logger || null;
  }

  // ────────────────────────────────────────────────────────────────
  // PRIMARY: generate QBR
  // ────────────────────────────────────────────────────────────────

  /**
   * Assemble a complete bilingual QBR record.
   * Never mutates previous QBRs — if one already exists for the same
   * customer+quarter, the previous is marked SUPERSEDED and a new
   * one is appended with `supersedes: prevId`.
   *
   * @param {object} args
   * @param {string} args.customerId
   * @param {string|object} args.quarter
   * @param {string[]} [args.sections]  — subset / ordering override
   * @returns {object} qbrRecord
   */
  generateQBR(args = {}) {
    const {
      customerId,
      quarter,
      period,
      sections,
      goals,
      usage,
      support,
      invoices,
      surveys,
      healthScore,
      nps,
    } = args;
    if (!customerId) throw new Error('customerId required');
    // Accept either `quarter` (legacy) or `period` (new spec alias).
    const q = normalizeQuarter(quarter != null ? quarter : period);
    const sectionIds = this._resolveSections(sections);

    const data = this.pullData(customerId, q);
    // Allow caller-supplied raw data (new spec) to override / merge into
    // the module-pulled bundle without losing either pathway.
    this._mergeInlineData(data, { goals, usage, support, invoices, surveys, healthScore, nps });
    const sponsor = this.executiveSponsor(customerId);

    const assembled = {};
    for (const sec of sectionIds) {
      assembled[sec] = this._assembleSection(sec, { data, customerId, quarter: q, sponsor });
    }

    // Supersede any existing QBR for this customer+quarter
    const prev = this.store.listQBRs(customerId)
      .find((r) => r.quarter.label === q.label && r.status !== QBR_STATUS.SUPERSEDED);
    if (prev) {
      prev.status = QBR_STATUS.SUPERSEDED;
      prev.supersededAt = this.now().toISOString();
      prev.history.push({
        at: prev.supersededAt,
        status: QBR_STATUS.SUPERSEDED,
        note: 'superseded by regeneration',
      });
      this.store.saveQBR(prev);
    }

    const id = qbrIdFor(customerId, q.label);
    // If we just used the same id, append a suffix — deterministic + unique
    const finalId = prev && prev.id === id
      ? `${id}-r${(prev.history.filter((h) => h.status === QBR_STATUS.SUPERSEDED).length) + 1}`
      : id;

    const record = {
      id: finalId,
      customerId,
      quarter: q,
      status: QBR_STATUS.ASSEMBLED,
      sponsor,
      sectionIds,
      sections: assembled,
      theme: { name: 'palantir', tokens: this.theme },
      supersedes: prev ? prev.id : null,
      createdAt: this.now().toISOString(),
      history: [{ at: this.now().toISOString(), status: QBR_STATUS.ASSEMBLED, note: 'generated' }],
    };
    this.store.saveQBR(record);

    // Seed commitments & follow-ups arrays so later updates are append-only
    this.store.listCommitments(finalId); // ensure key exists (returns [])
    this.store.listActions(finalId);
    return record;
  }

  /**
   * Aggregate raw data from every data source the QBR touches.
   * Memoised on the store, so two generateQBR runs for the same
   * customer+quarter do not double-pull.
   *
   * @returns {object} dataBundle
   */
  pullData(customerId, quarter) {
    const q = normalizeQuarter(quarter);
    const key = `pull:${customerId}:${q.label}`;
    const cached = this.store.getCachedPull(key);
    if (cached) return cached;

    const customer = (this.modules.customers.getCustomer &&
                      this.modules.customers.getCustomer(customerId)) || null;

    const billing = (this.modules.billing.getQuarter &&
                     this.modules.billing.getQuarter(customerId, q)) || {};
    const usage   = (this.modules.usage.getQuarter &&
                     this.modules.usage.getQuarter(customerId, q)) || {};
    const support = (this.modules.support.getQuarter &&
                     this.modules.support.getQuarter(customerId, q)) || {};
    const health  = (this.modules.health.getSnapshot &&
                     this.modules.health.getSnapshot(customerId, q)) || null;
    const plan    = (this.modules.success.getPlan &&
                     this.modules.success.getPlan(customerId, q)) || null;
    const roadmap = (this.modules.roadmap.getItemsFor &&
                     this.modules.roadmap.getItemsFor(customerId, q)) || [];
    const issues  = (this.modules.issues.getOpenFor &&
                     this.modules.issues.getOpenFor(customerId, q)) || [];
    const expansion = (this.modules.billing.getExpansionOpportunities &&
                       this.modules.billing.getExpansionOpportunities(customerId, q)) || [];

    const bundle = {
      pulledAt: this.now().toISOString(),
      customerId,
      quarter: q,
      customer,
      billing:  this._normaliseBilling(billing),
      usage:    this._normaliseUsage(usage),
      support:  this._normaliseSupport(support),
      health:   this._normaliseHealth(health, { usage, support, billing, plan }),
      plan:     this._normalisePlan(plan),
      roadmap:  Array.isArray(roadmap) ? roadmap.slice() : [],
      issues:   Array.isArray(issues) ? issues.slice() : [],
      expansion: Array.isArray(expansion) ? expansion.slice() : [],
    };
    this.store.cachePull(key, bundle);
    return bundle;
  }

  /**
   * Identify / return the customer's executive sponsor. Falls back
   * to a deterministic placeholder so the CSM can still run the QBR
   * when the account record is incomplete — but flags `verified:false`
   * so the gap is visible.
   */
  executiveSponsor(customerId) {
    const raw = (this.modules.customers.getExecSponsor &&
                 this.modules.customers.getExecSponsor(customerId)) || null;
    if (raw && raw.name) {
      return {
        customerId,
        name:     raw.name,
        title:    raw.title || 'Executive Sponsor',
        email:    raw.email || null,
        phone:    raw.phone || null,
        verified: Boolean(raw.email),
        source:   raw.source || 'customer-record',
      };
    }
    return {
      customerId,
      name:     'TBD',
      title:    'Executive Sponsor',
      email:    null,
      phone:    null,
      verified: false,
      source:   'placeholder',
      warning:  {
        he: 'יש לזהות נאמן בכיר לפני המפגש',
        en: 'Executive sponsor must be identified before the meeting',
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // RENDER: PDF + SLIDES + PREP
  // ────────────────────────────────────────────────────────────────

  /**
   * Produce a Palantir-themed bilingual PDF payload.
   * The returned object carries a printable JSON structure AND a
   * textual PDF byte stream — so a downstream renderer can choose
   * either the rich JSON or the minimal plain PDF binary.
   */
  generatePDF(qbrId) {
    const qbr = this._mustGet(qbrId);
    const title = `${LABELS.QBR_TITLE.en} / ${LABELS.QBR_TITLE.he} — ${qbr.quarter.label}`;

    const pages = [];
    // Cover page
    pages.push({
      type: 'cover',
      title,
      subtitle_en: `Customer: ${qbr.customerId}`,
      subtitle_he: `לקוח: ${qbr.customerId}`,
      sponsor: qbr.sponsor,
      theme: this.theme,
    });
    // One page per section
    for (const sec of qbr.sectionIds) {
      pages.push({
        type: 'section',
        id: sec,
        heading_en: LABELS[this._labelKey(sec)].en,
        heading_he: LABELS[this._labelKey(sec)].he,
        body: qbr.sections[sec],
      });
    }

    const textStream = this._renderPDFText(pages, qbr);

    return {
      qbrId: qbr.id,
      mimeType: 'application/pdf',
      filename: `QBR-${qbr.customerId}-${qbr.quarter.label}.pdf`,
      theme: 'palantir',
      pageCount: pages.length,
      pages,
      pdfBytes: Buffer.from(textStream, 'utf8'),
      textPreview: textStream.slice(0, 400),
    };
  }

  /**
   * Slide-deck payload — each section becomes 1 slide; the payload is
   * shaped to drop straight into pptxgenjs (or any JSON-driven slide
   * renderer).
   */
  generateSlides(qbrId) {
    const qbr = this._mustGet(qbrId);
    const slides = [];

    slides.push({
      layout: 'title',
      direction: 'rtl',
      title:    { he: LABELS.QBR_TITLE.he + ' — ' + qbr.quarter.label,
                  en: LABELS.QBR_TITLE.en + ' — ' + qbr.quarter.label },
      subtitle: {
        he: `לקוח ${qbr.customerId} • נאמן בכיר: ${qbr.sponsor.name}`,
        en: `Customer ${qbr.customerId} • Exec sponsor: ${qbr.sponsor.name}`,
      },
      theme: this.theme,
    });

    for (const sec of qbr.sectionIds) {
      slides.push({
        layout: 'content',
        id: sec,
        heading: {
          he: LABELS[this._labelKey(sec)].he,
          en: LABELS[this._labelKey(sec)].en,
        },
        bullets: this._sectionBullets(qbr.sections[sec]),
        raw: qbr.sections[sec],
      });
    }

    slides.push({
      layout: 'closing',
      heading: { he: 'שאלות ודיון', en: 'Questions & Discussion' },
      theme: this.theme,
    });

    return {
      qbrId: qbr.id,
      format: 'pptx-json',
      filename: `QBR-${qbr.customerId}-${qbr.quarter.label}.pptx.json`,
      slideCount: slides.length,
      slides,
      theme: 'palantir',
    };
  }

  /**
   * 1-pager prep-sheet for the CSM — compact bilingual briefing with
   * the 5 things they must know before walking in the room.
   */
  prepMaterials(qbrId) {
    const qbr = this._mustGet(qbrId);
    const usage  = qbr.sections[SECTIONS.USAGE_METRICS]  || {};
    const health = qbr.sections[SECTIONS.HEALTH_SCORE]   || {};
    const support = qbr.sections[SECTIONS.SUPPORT_SUMMARY] || {};
    const goals   = qbr.sections[SECTIONS.GOALS]         || {};
    const asks    = qbr.sections[SECTIONS.ASKS_COMMITMENTS] || {};
    const issues  = qbr.sections[SECTIONS.KNOWN_ISSUES]  || {};

    return {
      qbrId: qbr.id,
      type: 'prep-one-pager',
      title: { he: LABELS.PREP_SHEET.he, en: LABELS.PREP_SHEET.en },
      customerId: qbr.customerId,
      quarter: qbr.quarter.label,
      sponsor: qbr.sponsor,
      keyFacts: [
        { he: 'ציון בריאות',   en: 'Health score',
          value: health.score != null ? String(health.score) : 'n/a',
          status: health.band || null },
        { he: 'משתמשים פעילים', en: 'Active users',
          value: String(usage.activeUsers || 0) },
        { he: 'פניות פתוחות', en: 'Open tickets',
          value: String((support.open || 0)) },
        { he: 'יעדים שהושגו', en: 'Goals achieved',
          value: String((goals.counts && goals.counts.achieved) || 0) },
        { he: 'בעיות ידועות',  en: 'Known issues',
          value: String((issues.items && issues.items.length) || 0) },
      ],
      talkingPoints: this._talkingPoints(qbr),
      risks: this._riskList(qbr),
      commitmentsFromLast: qbr.sections[SECTIONS.ASKS_COMMITMENTS]?.previousCommitments || [],
      upcomingAsks: asks.asks || [],
      theme: this.theme,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // COMMITMENT / ACTION TRACKING (append-only)
  // ────────────────────────────────────────────────────────────────

  /**
   * Track commitments made at the QBR. If called with an array, each
   * commitment is appended to the QBR's commitment list; if called
   * without arguments, returns the current list.
   */
  trackCommitments(qbrId, commitments) {
    this._mustGet(qbrId);
    if (commitments && !Array.isArray(commitments)) {
      commitments = [commitments];
    }
    if (commitments && commitments.length) {
      for (const raw of commitments) {
        const c = {
          id:     raw.id || shortId('CMT'),
          qbrId,
          title:  raw.title || { he: raw.titleHe || 'התחייבות', en: raw.titleEn || 'Commitment' },
          description: raw.description || null,
          owner:  raw.owner || ACTION_OWNER.VENDOR,
          ownerName: raw.ownerName || null,
          dueDate:   raw.dueDate || null,
          status:    raw.status || COMMITMENT_STATUS.OPEN,
          createdAt: this.now().toISOString(),
          history:   [{
            at: this.now().toISOString(),
            status: raw.status || COMMITMENT_STATUS.OPEN,
            note: 'committed at QBR',
          }],
        };
        this.store.appendCommitment(qbrId, c);
      }
    }
    return this.store.listCommitments(qbrId);
  }

  /**
   * Post-QBR follow-up actions. Append-only — a "done" action stays
   * in the list with its history trail intact.
   */
  followUpActions(qbrId, actions) {
    this._mustGet(qbrId);
    if (actions && !Array.isArray(actions)) actions = [actions];
    if (actions && actions.length) {
      for (const raw of actions) {
        const a = {
          id:    raw.id || shortId('ACT'),
          qbrId,
          title: raw.title || { he: raw.titleHe || 'משימה', en: raw.titleEn || 'Action' },
          owner: raw.owner || ACTION_OWNER.VENDOR,
          ownerName: raw.ownerName || null,
          dueDate:   raw.dueDate || null,
          status:    raw.status || COMMITMENT_STATUS.OPEN,
          createdAt: this.now().toISOString(),
          history:   [{
            at: this.now().toISOString(),
            status: raw.status || COMMITMENT_STATUS.OPEN,
            note: 'opened from QBR follow-up',
          }],
        };
        this.store.appendAction(qbrId, a);
      }
    }
    return this.store.listActions(qbrId);
  }

  /**
   * Schedule the next QBR exactly one calendar-quarter after the one
   * being reviewed. Writes the schedule to the store. Never overwrites
   * silently — supersedes an earlier schedule via history.
   */
  scheduleNextQBR(qbrId) {
    const qbr = this._mustGet(qbrId);
    const nextQ = this._nextQuarter(qbr.quarter);
    // Target the 15th of the second month of the next quarter at 12:00 UTC so
    // the ISO string is still within the target month across all time zones.
    const target = new Date(Date.UTC(nextQ.year, (nextQ.q - 1) * 3 + 1, 15, 12, 0, 0));
    const schedule = {
      qbrId,
      customerId: qbr.customerId,
      currentQuarter: qbr.quarter.label,
      nextQuarter:    nextQ.label,
      scheduledFor:   target.toISOString(),
      status:         'scheduled',
      createdAt:      this.now().toISOString(),
      history: [{
        at: this.now().toISOString(),
        status: 'scheduled',
        note: `auto-scheduled from ${qbr.id}`,
      }],
    };
    const prev = this.store.getSchedule(qbrId);
    if (prev) {
      prev.history.push({
        at: this.now().toISOString(),
        status: 'superseded',
        note:   `replaced by ${schedule.scheduledFor}`,
      });
      schedule.history.unshift(...prev.history);
    }
    this.store.setSchedule(qbrId, schedule);
    return schedule;
  }

  // ────────────────────────────────────────────────────────────────
  // SECTION ASSEMBLY — private
  // ────────────────────────────────────────────────────────────────

  _resolveSections(sections) {
    if (!sections || !sections.length) return SECTION_ORDER.slice();
    const valid = new Set(Object.values(SECTIONS));
    const out = [];
    for (const s of sections) {
      if (!valid.has(s)) throw new Error(`unknown section: ${s}`);
      out.push(s);
    }
    return out;
  }

  _assembleSection(id, ctx) {
    switch (id) {
      case SECTIONS.EXECUTIVE_SUMMARY:  return this._sectExecutiveSummary(ctx);
      case SECTIONS.USAGE_METRICS:      return this._sectUsage(ctx);
      case SECTIONS.BUSINESS_IMPACT:    return this._sectBusinessImpact(ctx);
      case SECTIONS.SUPPORT_SUMMARY:    return this._sectSupport(ctx);
      case SECTIONS.HEALTH_SCORE:       return this._sectHealth(ctx);
      case SECTIONS.GOALS:              return this._sectGoals(ctx);
      case SECTIONS.EXPANSION:          return this._sectExpansion(ctx);
      case SECTIONS.ROADMAP:            return this._sectRoadmap(ctx);
      case SECTIONS.KNOWN_ISSUES:       return this._sectKnownIssues(ctx);
      case SECTIONS.ASKS_COMMITMENTS:   return this._sectAsksCommitments(ctx);
      case SECTIONS.NEXT_QUARTER_GOALS: return this._sectNextQuarterGoals(ctx);
      default: return {};
    }
  }

  _sectExecutiveSummary(ctx) {
    const u = ctx.data.usage  || {};
    const h = ctx.data.health || {};
    const s = ctx.data.support || {};
    const b = ctx.data.billing || {};
    const bullets_en = [
      `Active users: ${u.activeUsers || 0} (${u.activeUsersTrendPct != null ? u.activeUsersTrendPct + '%' : 'n/a'} QoQ)`,
      `Health score: ${h.score || 0} (${(h.band && h.band.en) || 'n/a'})`,
      `ARR: ${b.arr != null ? b.arr : 'n/a'}`,
      `Tickets: ${(s.opened || 0)} opened / ${(s.closed || 0)} closed, CSAT ${s.csat || 'n/a'}`,
    ];
    const bullets_he = [
      `משתמשים פעילים: ${u.activeUsers || 0} (${u.activeUsersTrendPct != null ? u.activeUsersTrendPct + '%' : 'לא זמין'} ברבעון)`,
      `ציון בריאות: ${h.score || 0} (${(h.band && h.band.he) || 'לא זמין'})`,
      `ARR: ${b.arr != null ? b.arr : 'לא זמין'}`,
      `פניות: ${(s.opened || 0)} נפתחו / ${(s.closed || 0)} נסגרו, CSAT ${s.csat || 'לא זמין'}`,
    ];
    return {
      quarterLabel: ctx.quarter.label,
      customerId:   ctx.customerId,
      headline: {
        he: `תקציר רבעון ${ctx.quarter.label} עבור ${ctx.customerId}`,
        en: `Quarter ${ctx.quarter.label} summary for ${ctx.customerId}`,
      },
      bullets: { he: bullets_he, en: bullets_en },
    };
  }

  _sectUsage(ctx) {
    const u = ctx.data.usage || {};
    const features = Array.isArray(u.featuresUsed) ? u.featuresUsed : [];
    return {
      label: LABELS.USAGE_METRICS,
      logins:               u.logins || 0,
      activeUsers:          u.activeUsers || 0,
      activeUsersTrendPct:  u.activeUsersTrendPct || 0,
      featuresUsed:         features,
      featuresCount:        features.length,
      topFeatures:          features.slice(0, 5),
      valueDelivered:       u.valueDelivered || null,
      eventsTotal:          u.eventsTotal || 0,
    };
  }

  _sectBusinessImpact(ctx) {
    const u = ctx.data.usage || {};
    const b = ctx.data.billing || {};
    const p = ctx.data.plan || {};
    const kpis = Array.isArray(p.kpis) ? p.kpis : [];

    // ROI = (benefit − cost) / cost
    const benefit = Number(u.valueDelivered && u.valueDelivered.amount) || 0;
    const cost    = Number(b.arr || b.contractValue || 0);
    const roi     = cost > 0 ? +(((benefit - cost) / cost) * 100).toFixed(1) : null;

    return {
      label: LABELS.BUSINESS_IMPACT,
      kpis: kpis.map((k) => ({
        id:     k.id || shortId('KPI'),
        label:  k.label || { he: k.labelHe || 'מדד', en: k.labelEn || 'KPI' },
        target: k.target != null ? k.target : null,
        actual: k.actual != null ? k.actual : null,
        unit:   k.unit  || null,
        deltaPct: (k.target && k.actual != null)
          ? pct(Number(k.actual) - Number(k.target), Math.abs(Number(k.target)))
          : null,
      })),
      valueDelivered: u.valueDelivered || null,
      investmentArr:  cost,
      roiPct:         roi,
      currency:       (u.valueDelivered && u.valueDelivered.currency) || b.currency || 'ILS',
    };
  }

  _sectSupport(ctx) {
    const s = ctx.data.support || {};
    return {
      label: LABELS.SUPPORT_SUMMARY,
      opened:    s.opened || 0,
      closed:    s.closed || 0,
      open:      Math.max(0, (s.opened || 0) - (s.closed || 0)),
      p1Count:   s.p1Count || 0,
      avgResolutionHours: s.avgResolutionHours != null ? s.avgResolutionHours : null,
      firstResponseHours: s.firstResponseHours != null ? s.firstResponseHours : null,
      csat:      s.csat != null ? s.csat : null,
      nps:       s.nps  != null ? s.nps  : null,
      escalations: s.escalations || 0,
      topCategories: Array.isArray(s.topCategories) ? s.topCategories : [],
    };
  }

  _sectHealth(ctx) {
    const h = ctx.data.health || {};
    const score = h.score != null ? h.score : computeHealthScore(h.metrics || {});
    const band = bandOf(score);
    return {
      label: LABELS.HEALTH_SCORE,
      score,
      band: { he: band.he, en: band.en, key: band.key, color: band.color },
      components: h.metrics || null,
      trend: h.trend || null,
      notes: h.notes || null,
    };
  }

  _sectGoals(ctx) {
    const p = ctx.data.plan || {};
    const goals = Array.isArray(p.goals) ? p.goals : [];
    const counts = {
      achieved: 0, in_progress: 0, at_risk: 0, blocked: 0, deferred: 0,
    };
    const out = goals.map((g) => {
      const status = g.status || GOAL_STATUS.IN_PROGRESS;
      if (counts[status] != null) counts[status] += 1;
      return {
        id: g.id || shortId('GOAL'),
        title: g.title || { he: g.titleHe || 'יעד', en: g.titleEn || 'Goal' },
        status,
        owner: g.owner || null,
        dueDate: g.dueDate || null,
        progressPct: g.progressPct != null ? g.progressPct : null,
        notes: g.notes || null,
      };
    });
    return {
      label: LABELS.GOALS,
      counts,
      total: goals.length,
      items: out,
    };
  }

  _sectExpansion(ctx) {
    const opps = Array.isArray(ctx.data.expansion) ? ctx.data.expansion : [];
    return {
      label: LABELS.EXPANSION,
      count: opps.length,
      estimatedArrUplift: sum(opps, (o) => o.arrUplift || 0),
      items: opps.map((o) => ({
        id: o.id || shortId('EXP'),
        title: o.title || { he: o.titleHe || 'הזדמנות', en: o.titleEn || 'Opportunity' },
        module: o.module || null,
        arrUplift: o.arrUplift || 0,
        probability: o.probability || null,
        nextStep: o.nextStep || null,
      })),
    };
  }

  _sectRoadmap(ctx) {
    const items = Array.isArray(ctx.data.roadmap) ? ctx.data.roadmap : [];
    return {
      label: LABELS.ROADMAP,
      items: items.map((r) => ({
        id: r.id || shortId('RM'),
        title: r.title || { he: r.titleHe || 'פריט', en: r.titleEn || 'Item' },
        stage: r.stage || 'planned',
        eta:   r.eta || null,
        relevance: r.relevance || 'medium',
        notes: r.notes || null,
      })),
    };
  }

  _sectKnownIssues(ctx) {
    const issues = Array.isArray(ctx.data.issues) ? ctx.data.issues : [];
    return {
      label: LABELS.KNOWN_ISSUES,
      items: issues.map((i) => ({
        id: i.id || shortId('ISS'),
        title: i.title || { he: i.titleHe || 'בעיה', en: i.titleEn || 'Issue' },
        severity: i.severity || 'medium',
        status:   i.status   || 'open',
        eta:      i.eta      || null,
        workaround: i.workaround || null,
      })),
    };
  }

  _sectAsksCommitments(ctx) {
    const p = ctx.data.plan || {};
    const asks = Array.isArray(p.asks) ? p.asks : [];
    const prevCommits = Array.isArray(p.previousCommitments) ? p.previousCommitments : [];
    return {
      label: LABELS.ASKS_COMMITMENTS,
      asks: asks.map((a) => ({
        id: a.id || shortId('ASK'),
        title: a.title || { he: a.titleHe || 'בקשה', en: a.titleEn || 'Ask' },
        from:  a.from  || 'customer',
        priority: a.priority || 'medium',
      })),
      previousCommitments: prevCommits.map((c) => ({
        id: c.id || shortId('PCMT'),
        title: c.title || { he: c.titleHe || 'התחייבות', en: c.titleEn || 'Commitment' },
        status: c.status || COMMITMENT_STATUS.OPEN,
        dueDate: c.dueDate || null,
      })),
    };
  }

  _sectNextQuarterGoals(ctx) {
    const p = ctx.data.plan || {};
    const g = Array.isArray(p.nextQuarterGoals) ? p.nextQuarterGoals : [];
    const next = this._nextQuarter(ctx.quarter);
    return {
      label: LABELS.NEXT_QUARTER_GOALS,
      quarter: next.label,
      items: g.map((x) => ({
        id: x.id || shortId('NG'),
        title: x.title || { he: x.titleHe || 'יעד', en: x.titleEn || 'Goal' },
        owner: x.owner || null,
        targetDate: x.targetDate || null,
        metric: x.metric || null,
      })),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // NORMALISERS — make every data source tolerant of missing fields
  // ────────────────────────────────────────────────────────────────

  _normaliseBilling(b) {
    return {
      currency:       b.currency || 'ILS',
      mrr:            b.mrr != null ? Number(b.mrr) : null,
      arr:            b.arr != null ? Number(b.arr) : null,
      contractValue:  b.contractValue != null ? Number(b.contractValue) : null,
      invoicesCount:  b.invoicesCount || 0,
      amountInvoiced: b.amountInvoiced != null ? Number(b.amountInvoiced) : 0,
      amountCollected: b.amountCollected != null ? Number(b.amountCollected) : 0,
      renewalDate:    b.renewalDate || null,
    };
  }

  _normaliseUsage(u) {
    const features = Array.isArray(u.featuresUsed) ? u.featuresUsed : [];
    return {
      logins:              u.logins || 0,
      activeUsers:         u.activeUsers || 0,
      activeUsersTrendPct: u.activeUsersTrendPct != null ? Number(u.activeUsersTrendPct) : null,
      eventsTotal:         u.eventsTotal || 0,
      featuresUsed:        features,
      valueDelivered:      u.valueDelivered || null,
      dauWau:              u.dauWau != null ? Number(u.dauWau) : null,
    };
  }

  _normaliseSupport(s) {
    return {
      opened:  s.opened || 0,
      closed:  s.closed || 0,
      p1Count: s.p1Count || 0,
      avgResolutionHours: s.avgResolutionHours != null ? Number(s.avgResolutionHours) : null,
      firstResponseHours: s.firstResponseHours != null ? Number(s.firstResponseHours) : null,
      csat: s.csat != null ? Number(s.csat) : null,
      nps:  s.nps  != null ? Number(s.nps)  : null,
      escalations: s.escalations || 0,
      topCategories: Array.isArray(s.topCategories) ? s.topCategories : [],
    };
  }

  _normaliseHealth(h, sources) {
    if (h && typeof h.score === 'number') return h;
    // Derive from usage + support signals if we didn't get a pre-computed snapshot
    const u = sources.usage || {};
    const s = sources.support || {};
    const b = sources.billing || {};
    const metrics = {
      usage:       u.activeUsersTrendPct != null
        ? clamp(60 + Number(u.activeUsersTrendPct), 0, 100)
        : (u.activeUsers ? 70 : 40),
      sentiment:   s.csat != null ? clamp(Number(s.csat) * 20, 0, 100) : null,
      support:     s.avgResolutionHours != null
        ? clamp(100 - Number(s.avgResolutionHours), 0, 100)
        : null,
      financial:   b.amountInvoiced ? clamp(pct(b.amountCollected || 0, b.amountInvoiced), 0, 100) : null,
      adoption:    Array.isArray(u.featuresUsed) && u.featuresUsed.length
        ? clamp(u.featuresUsed.length * 10, 0, 100)
        : null,
      sponsorship: null, // unknown from raw data
    };
    return { score: computeHealthScore(metrics), metrics, trend: null, notes: null };
  }

  _normalisePlan(p) {
    if (!p) return { kpis: [], goals: [], asks: [], previousCommitments: [], nextQuarterGoals: [] };
    return {
      kpis: Array.isArray(p.kpis) ? p.kpis : [],
      goals: Array.isArray(p.goals) ? p.goals : [],
      asks: Array.isArray(p.asks) ? p.asks : [],
      previousCommitments: Array.isArray(p.previousCommitments) ? p.previousCommitments : [],
      nextQuarterGoals: Array.isArray(p.nextQuarterGoals) ? p.nextQuarterGoals : [],
    };
  }

  // ────────────────────────────────────────────────────────────────
  // RENDERING HELPERS
  // ────────────────────────────────────────────────────────────────

  _renderPDFText(pages, qbr) {
    // Minimal PDF-ish text envelope (valid first-line header + stream of
    // content pages) so a byte buffer can be surfaced.  Not a full PDF
    // spec, but enough for tests to assert structure & length.
    const lines = [];
    lines.push('%PDF-1.7');
    lines.push('% QBR generated by Techno-Kol Uzi QBR-Generator (Agent Y-104)');
    lines.push(`% Customer: ${qbr.customerId}`);
    lines.push(`% Quarter: ${qbr.quarter.label}`);
    lines.push(`% Pages: ${pages.length}`);
    lines.push(`% Theme: palantir`);
    lines.push('');
    for (const p of pages) {
      lines.push(`=== PAGE ${p.type} ===`);
      if (p.title)      lines.push(`Title: ${p.title}`);
      if (p.heading_en) lines.push(`Heading EN: ${p.heading_en}`);
      if (p.heading_he) lines.push(`Heading HE: ${p.heading_he}`);
      if (p.subtitle_en) lines.push(`Subtitle EN: ${p.subtitle_en}`);
      if (p.subtitle_he) lines.push(`Subtitle HE: ${p.subtitle_he}`);
      if (p.body) lines.push(`Body: ${JSON.stringify(p.body)}`);
      lines.push('');
    }
    lines.push('%%EOF');
    return lines.join('\n');
  }

  _sectionBullets(section) {
    if (!section) return [];
    const bullets = [];
    // Headline bullets are derived from stable keys per section
    if (section.headline) {
      bullets.push({ he: section.headline.he, en: section.headline.en });
    }
    if (Array.isArray(section.bullets?.en)) {
      for (let i = 0; i < section.bullets.en.length; i += 1) {
        bullets.push({
          he: (section.bullets.he && section.bullets.he[i]) || '',
          en: section.bullets.en[i],
        });
      }
    }
    if (section.score != null) {
      bullets.push({
        he: `ציון: ${section.score}`,
        en: `Score: ${section.score}`,
      });
    }
    if (Array.isArray(section.items)) {
      for (const it of section.items.slice(0, 6)) {
        bullets.push({
          he: (it.title && it.title.he) || it.id || '',
          en: (it.title && it.title.en) || it.id || '',
        });
      }
    }
    if (section.kpis && Array.isArray(section.kpis)) {
      for (const k of section.kpis.slice(0, 4)) {
        bullets.push({
          he: `${(k.label && k.label.he) || ''}: ${k.actual || '—'} / ${k.target || '—'}`,
          en: `${(k.label && k.label.en) || ''}: ${k.actual || '—'} / ${k.target || '—'}`,
        });
      }
    }
    return bullets;
  }

  _talkingPoints(qbr) {
    const out = [];
    const h = qbr.sections[SECTIONS.HEALTH_SCORE];
    if (h && h.band) {
      out.push({
        he: `בריאות החשבון: ${h.band.he} (${h.score})`,
        en: `Account health: ${h.band.en} (${h.score})`,
      });
    }
    const g = qbr.sections[SECTIONS.GOALS];
    if (g && g.counts) {
      out.push({
        he: `יעדים: ${g.counts.achieved} הושגו, ${g.counts.in_progress} בתהליך, ${g.counts.at_risk} בסיכון`,
        en: `Goals: ${g.counts.achieved} achieved, ${g.counts.in_progress} in progress, ${g.counts.at_risk} at risk`,
      });
    }
    const e = qbr.sections[SECTIONS.EXPANSION];
    if (e && e.count) {
      out.push({
        he: `${e.count} הזדמנויות הרחבה (${e.estimatedArrUplift} ILS פוטנציאל)`,
        en: `${e.count} expansion opportunities (${e.estimatedArrUplift} ILS pipeline)`,
      });
    }
    return out;
  }

  _riskList(qbr) {
    const risks = [];
    const h = qbr.sections[SECTIONS.HEALTH_SCORE];
    if (h && h.score != null && h.score < HEALTH_BAND.NEUTRAL.min) {
      risks.push({
        he: `ציון בריאות נמוך (${h.score})`,
        en: `Low health score (${h.score})`,
        severity: 'high',
      });
    }
    const g = qbr.sections[SECTIONS.GOALS];
    if (g && g.counts && g.counts.at_risk + g.counts.blocked > 0) {
      risks.push({
        he: `${g.counts.at_risk + g.counts.blocked} יעדים בסיכון / חסומים`,
        en: `${g.counts.at_risk + g.counts.blocked} goals at-risk / blocked`,
        severity: 'medium',
      });
    }
    const s = qbr.sections[SECTIONS.SUPPORT_SUMMARY];
    if (s && s.p1Count > 0) {
      risks.push({
        he: `${s.p1Count} פניות P1 ברבעון`,
        en: `${s.p1Count} P1 tickets in quarter`,
        severity: 'high',
      });
    }
    const sponsor = qbr.sponsor;
    if (!sponsor || !sponsor.verified) {
      risks.push({
        he: 'נאמן בכיר לא מזוהה / לא מאומת',
        en: 'Executive sponsor unidentified / unverified',
        severity: 'medium',
      });
    }
    return risks;
  }

  _labelKey(sectionId) {
    switch (sectionId) {
      case SECTIONS.EXECUTIVE_SUMMARY:   return 'EXECUTIVE_SUMMARY';
      case SECTIONS.USAGE_METRICS:       return 'USAGE_METRICS';
      case SECTIONS.BUSINESS_IMPACT:     return 'BUSINESS_IMPACT';
      case SECTIONS.SUPPORT_SUMMARY:     return 'SUPPORT_SUMMARY';
      case SECTIONS.HEALTH_SCORE:        return 'HEALTH_SCORE';
      case SECTIONS.GOALS:               return 'GOALS';
      case SECTIONS.EXPANSION:           return 'EXPANSION';
      case SECTIONS.ROADMAP:             return 'ROADMAP';
      case SECTIONS.KNOWN_ISSUES:        return 'KNOWN_ISSUES';
      case SECTIONS.ASKS_COMMITMENTS:    return 'ASKS_COMMITMENTS';
      case SECTIONS.NEXT_QUARTER_GOALS:  return 'NEXT_QUARTER_GOALS';
      default: return null;
    }
  }

  _mustGet(qbrId) {
    const r = this.store.getQBR(qbrId);
    if (!r) throw new Error(`qbr not found: ${qbrId}`);
    return r;
  }

  _nextQuarter(current) {
    const q = current.q + 1;
    if (q > 4) return normalizeQuarter({ year: current.year + 1, q: 1 });
    return normalizeQuarter({ year: current.year, q });
  }

  /**
   * Merge inline data (new-spec signature) into the module-pulled bundle.
   * Never deletes — only augments / overrides the fields supplied.
   */
  _mergeInlineData(data, inline) {
    if (!inline) return;
    const { goals, usage, support, invoices, surveys, healthScore, nps } = inline;

    if (usage && typeof usage === 'object') {
      data.usage = Object.assign({}, data.usage, this._normaliseUsage(usage));
      if (usage.valueDelivered) data.usage.valueDelivered = usage.valueDelivered;
    }
    if (Array.isArray(goals)) {
      data.plan = Object.assign({}, data.plan);
      data.plan.goals = goals.slice();
    }
    if (Array.isArray(invoices)) {
      data.invoices = invoices.slice();
      const totalInvoiced  = sum(invoices, (i) => i.amount || 0);
      const totalCollected = sum(
        invoices.filter((i) => i.status === 'paid' || i.status === 'collected'),
        (i) => i.amount || 0,
      );
      data.billing = Object.assign({}, data.billing, {
        invoicesCount: invoices.length,
        amountInvoiced: totalInvoiced,
        amountCollected: totalCollected,
      });
    }
    // Precedence for csat / nps: explicit support block > top-level nps > surveys.
    // Apply surveys first (lowest precedence), then support, then top-level nps.
    if (Array.isArray(surveys)) {
      data.surveys = surveys.slice();
      const csatSurveys = surveys.filter((s) => typeof s.csat === 'number');
      const npsSurveys  = surveys.filter((s) => typeof s.nps  === 'number');
      if (csatSurveys.length) {
        data.support = data.support || {};
        data.support.csat = +(avg(csatSurveys, (s) => s.csat)).toFixed(2);
      }
      if (npsSurveys.length) {
        data.support = data.support || {};
        data.support.nps = Math.round(avg(npsSurveys, (s) => s.nps));
      }
    }
    if (support && typeof support === 'object') {
      const normSupport = this._normaliseSupport(support);
      // Only overwrite a field when the caller actually supplied it;
      // null placeholders from `_normaliseSupport` must not clobber
      // survey-derived values written in the previous step.
      data.support = data.support || {};
      for (const [k, v] of Object.entries(normSupport)) {
        const rawProvided = Object.prototype.hasOwnProperty.call(support, k) && support[k] != null;
        if (rawProvided) data.support[k] = v;
        else if (data.support[k] == null) data.support[k] = v;
      }
    }
    if (typeof nps === 'number' && (!support || support.nps == null)) {
      data.support = Object.assign({}, data.support, { nps });
    }
    if (typeof healthScore === 'number') {
      data.health = Object.assign({}, data.health, { score: clamp(healthScore, 0, 100) });
    }
  }

  // ────────────────────────────────────────────────────────────────
  // NEW-SPEC API — 10 standard slide sections, ROI, recommendations,
  // archive, history, compare — Agent Y-104 extension
  // ────────────────────────────────────────────────────────────────

  /**
   * Build a single slide payload for one of the 10 standard sections.
   * Accepts either `SLIDE_SECTIONS.X` (kebab-case) or a SECTIONS.X key.
   */
  buildSlide(sectionKey, data = {}) {
    if (!sectionKey) throw new Error('sectionKey required');
    const key = String(sectionKey);
    const title = SLIDE_TITLES[key];
    if (!title) throw new Error(`unknown slide section: ${key}`);

    const slide = {
      sectionKey: key,
      title,
      direction: { primary: 'rtl', secondary: 'ltr' },
      theme: { name: 'palantir-dark', bg: '#0b0d10', panel: '#13171c', accent: '#4a9eff' },
      body: { he: [], en: [] },
      meta: {},
    };

    switch (key) {
      case SLIDE_SECTIONS.EXECUTIVE_SUMMARY: {
        const u = data.usage || {};
        const h = data.health || {};
        const b = data.billing || {};
        slide.body.he = [
          `לקוח: ${data.customerId || 'n/a'} • רבעון ${data.quarter || data.period || 'n/a'}`,
          `משתמשים פעילים: ${u.activeUsers || 0}`,
          `ציון בריאות: ${h.score != null ? h.score : 'n/a'}`,
          `ARR: ${b.arr != null ? b.arr : 'n/a'} ILS`,
        ];
        slide.body.en = [
          `Customer: ${data.customerId || 'n/a'} • Period ${data.quarter || data.period || 'n/a'}`,
          `Active users: ${u.activeUsers || 0}`,
          `Health score: ${h.score != null ? h.score : 'n/a'}`,
          `ARR: ${b.arr != null ? b.arr : 'n/a'} ILS`,
        ];
        break;
      }
      case SLIDE_SECTIONS.GOAL_PROGRESS: {
        const goals = Array.isArray(data.goals) ? data.goals : [];
        const progress = this.goalProgress(data.customerId || null, goals);
        slide.meta.progress = progress;
        slide.body.he = progress.perGoal.map((g) =>
          `• ${(g.title && g.title.he) || g.id}: ${g.achievedPct}% (${g.statusHe})`,
        );
        slide.body.en = progress.perGoal.map((g) =>
          `• ${(g.title && g.title.en) || g.id}: ${g.achievedPct}% (${g.statusEn})`,
        );
        break;
      }
      case SLIDE_SECTIONS.USAGE_METRICS: {
        const u = data.usage || {};
        slide.body.he = [
          `כניסות: ${u.logins || 0}`,
          `משתמשים פעילים: ${u.activeUsers || 0}`,
          `אירועים כוללים: ${u.eventsTotal || 0}`,
          `פיצ'רים בשימוש: ${(u.featuresUsed && u.featuresUsed.length) || 0}`,
        ];
        slide.body.en = [
          `Logins: ${u.logins || 0}`,
          `Active users: ${u.activeUsers || 0}`,
          `Total events: ${u.eventsTotal || 0}`,
          `Features used: ${(u.featuresUsed && u.featuresUsed.length) || 0}`,
        ];
        break;
      }
      case SLIDE_SECTIONS.VALUE_DELIVERED: {
        const value = this.valueDelivered(data.customerId || null, data.quarter || data.period, data);
        slide.meta.value = value;
        slide.body.he = [
          `חיסכונות: ${value.savings} ${value.currency}`,
          `הכנסה נוספת: ${value.revenue} ${value.currency}`,
          `יעילות: ${value.efficiency} ${value.currency}`,
          `סך הכל: ${value.total} ${value.currency}`,
        ];
        slide.body.en = [
          `Savings: ${value.savings} ${value.currency}`,
          `Revenue uplift: ${value.revenue} ${value.currency}`,
          `Efficiency: ${value.efficiency} ${value.currency}`,
          `Total: ${value.total} ${value.currency}`,
        ];
        break;
      }
      case SLIDE_SECTIONS.ROI_ANALYSIS: {
        const value = this.valueDelivered(data.customerId || null, data.quarter || data.period, data);
        const invest = Number((data.billing && (data.billing.arr || data.billing.contractValue)) || 0);
        const roiPct = invest > 0 ? +(((value.total - invest) / invest) * 100).toFixed(1) : null;
        slide.meta.investment = invest;
        slide.meta.roiPct = roiPct;
        slide.body.he = [
          `השקעה (ARR): ${invest} ${value.currency}`,
          `ערך כולל: ${value.total} ${value.currency}`,
          `ROI: ${roiPct != null ? roiPct + '%' : 'לא ניתן לחשב'}`,
        ];
        slide.body.en = [
          `Investment (ARR): ${invest} ${value.currency}`,
          `Total value: ${value.total} ${value.currency}`,
          `ROI: ${roiPct != null ? roiPct + '%' : 'n/a'}`,
        ];
        break;
      }
      case SLIDE_SECTIONS.SUPPORT_SUMMARY: {
        const summary = this.supportSummary(data.customerId || null, data.quarter || data.period, data);
        slide.meta.summary = summary;
        slide.body.he = [
          `פניות נפתחו: ${summary.opened}`,
          `פניות נסגרו: ${summary.closed}`,
          `P1 דחוף: ${summary.p1Count}`,
          `זמן טיפול ממוצע: ${summary.avgResolutionHours != null ? summary.avgResolutionHours + ' שעות' : 'n/a'}`,
          `CSAT: ${summary.csat != null ? summary.csat : 'n/a'}`,
        ];
        slide.body.en = [
          `Tickets opened: ${summary.opened}`,
          `Tickets closed: ${summary.closed}`,
          `P1 urgent: ${summary.p1Count}`,
          `Avg. resolution: ${summary.avgResolutionHours != null ? summary.avgResolutionHours + ' hrs' : 'n/a'}`,
          `CSAT: ${summary.csat != null ? summary.csat : 'n/a'}`,
        ];
        break;
      }
      case SLIDE_SECTIONS.NPS_CSAT: {
        const s = data.support || {};
        slide.body.he = [
          `NPS: ${s.nps != null ? s.nps : 'n/a'}`,
          `CSAT: ${s.csat != null ? s.csat : 'n/a'}`,
          `הסלמות: ${s.escalations || 0}`,
        ];
        slide.body.en = [
          `NPS: ${s.nps != null ? s.nps : 'n/a'}`,
          `CSAT: ${s.csat != null ? s.csat : 'n/a'}`,
          `Escalations: ${s.escalations || 0}`,
        ];
        break;
      }
      case SLIDE_SECTIONS.ROADMAP_PREVIEW: {
        const items = Array.isArray(data.roadmap) ? data.roadmap : [];
        slide.body.he = items.slice(0, 5).map((r) =>
          `• ${(r.title && r.title.he) || r.id}${r.eta ? ' — ' + r.eta : ''}`,
        );
        slide.body.en = items.slice(0, 5).map((r) =>
          `• ${(r.title && r.title.en) || r.id}${r.eta ? ' — ' + r.eta : ''}`,
        );
        if (!items.length) {
          slide.body.he = ['אין פריטים במפת הדרכים'];
          slide.body.en = ['No roadmap items'];
        }
        break;
      }
      case SLIDE_SECTIONS.ASKS_FROM_CUSTOMER: {
        const asks = Array.isArray(data.asks) ? data.asks
          : (data.plan && Array.isArray(data.plan.asks) ? data.plan.asks : []);
        slide.body.he = asks.length
          ? asks.map((a) => `• ${(a.title && a.title.he) || a.id} (${a.priority || 'רגיל'})`)
          : ['אין בקשות פתוחות'];
        slide.body.en = asks.length
          ? asks.map((a) => `• ${(a.title && a.title.en) || a.id} (${a.priority || 'normal'})`)
          : ['No open asks'];
        break;
      }
      case SLIDE_SECTIONS.NEXT_STEPS: {
        const next = Array.isArray(data.nextSteps) ? data.nextSteps
          : (data.plan && Array.isArray(data.plan.nextQuarterGoals) ? data.plan.nextQuarterGoals : []);
        slide.body.he = next.length
          ? next.map((n) => `• ${(n.title && n.title.he) || n.id}`)
          : ['• תזמן QBR הבא', '• שלח סיכום וחתימה'];
        slide.body.en = next.length
          ? next.map((n) => `• ${(n.title && n.title.en) || n.id}`)
          : ['• Schedule next QBR', '• Send recap and sign-off'];
        break;
      }
      default: break;
    }
    return slide;
  }

  /**
   * Compute total value delivered in a period: savings + revenue + efficiency.
   * Uses inline data first, falls back to `pullData` if a customerId is given.
   */
  valueDelivered(customerId, period, inlineData) {
    let bundle = inlineData;
    if (!bundle && customerId) {
      const q = period ? normalizeQuarter(period) : null;
      if (q) bundle = this.pullData(customerId, q);
    }
    bundle = bundle || {};

    const vd = (bundle.usage && bundle.usage.valueDelivered) || {};
    const currency = vd.currency
      || (bundle.billing && bundle.billing.currency)
      || 'ILS';

    // Explicit inline breakdown wins when provided
    const explicit = bundle.valueBreakdown || vd.breakdown || null;
    let savings    = Number((explicit && explicit.savings)    || vd.savings    || 0);
    let revenue    = Number((explicit && explicit.revenue)    || vd.revenue    || 0);
    let efficiency = Number((explicit && explicit.efficiency) || vd.efficiency || 0);

    // If only a flat "amount" was supplied, bucket it as savings (conservative)
    if (!savings && !revenue && !efficiency && vd.amount) {
      const unit = (vd.unit || 'savings').toLowerCase();
      if (unit === 'revenue')         revenue    = Number(vd.amount);
      else if (unit === 'efficiency') efficiency = Number(vd.amount);
      else                            savings    = Number(vd.amount);
    }

    const total = savings + revenue + efficiency;
    return {
      customerId: customerId || null,
      period: bundle.quarter ? bundle.quarter.label : (period || null),
      currency,
      savings: +savings.toFixed(2),
      revenue: +revenue.toFixed(2),
      efficiency: +efficiency.toFixed(2),
      total: +total.toFixed(2),
      formula: '(savings + revenue + efficiency)',
    };
  }

  /**
   * Return % achieved per goal. A goal dictionary with `progressPct` is used
   * directly; otherwise status-to-percent mapping is applied.
   *
   * An explicit empty array is respected (returns 0-goal progress). Only a
   * truly undefined `goals` argument falls back to the module plan.
   */
  goalProgress(customerId, goals) {
    let list;
    if (Array.isArray(goals)) {
      list = goals;
    } else if (customerId) {
      const plan = this.modules.success && this.modules.success.getPlan
        ? this.modules.success.getPlan(customerId) : null;
      list = plan && Array.isArray(plan.goals) ? plan.goals : [];
    } else {
      list = [];
    }
    const statusPct = {
      [GOAL_STATUS.ACHIEVED]:    100,
      [GOAL_STATUS.IN_PROGRESS]: 50,
      [GOAL_STATUS.AT_RISK]:     30,
      [GOAL_STATUS.BLOCKED]:     10,
      [GOAL_STATUS.DEFERRED]:    0,
    };
    const perGoal = list.map((g) => {
      const status = g.status || GOAL_STATUS.IN_PROGRESS;
      const achievedPct = g.progressPct != null
        ? clamp(g.progressPct, 0, 100)
        : (statusPct[status] != null ? statusPct[status] : 0);
      return {
        id: g.id || shortId('GOAL'),
        title: g.title || { he: g.titleHe || 'יעד', en: g.titleEn || 'Goal' },
        status,
        statusHe: (LABELS[status.toUpperCase()] && LABELS[status.toUpperCase()].he) || status,
        statusEn: (LABELS[status.toUpperCase()] && LABELS[status.toUpperCase()].en) || status,
        achievedPct,
      };
    });
    const overallPct = perGoal.length
      ? +(sum(perGoal, (g) => g.achievedPct) / perGoal.length).toFixed(1)
      : 0;
    const counts = { achieved: 0, in_progress: 0, at_risk: 0, blocked: 0, deferred: 0 };
    for (const g of perGoal) {
      if (counts[g.status] != null) counts[g.status] += 1;
    }
    return { customerId: customerId || null, total: perGoal.length, counts, overallPct, perGoal };
  }

  /**
   * Support summary: tickets opened / closed / open, average resolution,
   * CSAT, escalations.
   */
  supportSummary(customerId, period, inlineData) {
    let bundle = inlineData;
    if (!bundle && customerId) {
      const q = period ? normalizeQuarter(period) : null;
      if (q) bundle = this.pullData(customerId, q);
    }
    bundle = bundle || {};
    const s = bundle.support || {};
    const opened = s.opened || 0;
    const closed = s.closed || 0;
    return {
      customerId: customerId || null,
      period: bundle.quarter ? bundle.quarter.label : (period || null),
      opened,
      closed,
      open: Math.max(0, opened - closed),
      p1Count: s.p1Count || 0,
      avgResolutionHours: s.avgResolutionHours != null ? s.avgResolutionHours : null,
      firstResponseHours: s.firstResponseHours != null ? s.firstResponseHours : null,
      csat: s.csat != null ? s.csat : null,
      nps:  s.nps  != null ? s.nps  : null,
      escalations: s.escalations || 0,
      topCategories: Array.isArray(s.topCategories) ? s.topCategories : [],
    };
  }

  /**
   * Rule-based recommendations:
   *   • high NPS (≥50)             → advocacy ask
   *   • low usage (activeUsers<10) → training offer
   *   • high ticket volume (≥20)   → health check
   *   • renewal within 90 days     → renewal conversation
   */
  recommendations(qbr) {
    if (!qbr) throw new Error('qbr required');
    const nowMs = this.now().getTime();
    const out = [];

    // Derive signals from either an inline payload or a stored QBR record
    const usage   = (qbr.sections && qbr.sections[SECTIONS.USAGE_METRICS])   || qbr.usage   || {};
    const support = (qbr.sections && qbr.sections[SECTIONS.SUPPORT_SUMMARY]) || qbr.support || {};
    const billing = (qbr.data && qbr.data.billing) || qbr.billing || {};
    const nps     = support.nps != null ? support.nps : (qbr.nps != null ? qbr.nps : null);
    const activeUsers = usage.activeUsers || 0;
    const tickets = (support.opened || 0);
    const renewalDate = billing.renewalDate || null;

    if (nps != null && nps >= 50) {
      out.push({
        rule: RECOMMENDATION_RULES.ADVOCACY,
        priority: 'high',
        title: { he: 'בקש הפניה / עדות לקוח', en: 'Advocacy ask — referral or case study' },
        rationale: {
          he: `NPS גבוה (${nps}) — הלקוח מרוצה, ניתן לבקש המלצה`,
          en: `High NPS (${nps}) — customer is a promoter, request referral`,
        },
      });
    }
    if (activeUsers < 10) {
      out.push({
        rule: RECOMMENDATION_RULES.TRAINING,
        priority: 'medium',
        title: { he: 'הצעת הדרכה והטמעה', en: 'Offer training & onboarding refresh' },
        rationale: {
          he: `שימוש נמוך (${activeUsers} משתמשים פעילים) — דרושה הגברת אימוץ`,
          en: `Low usage (${activeUsers} active users) — adoption needs a push`,
        },
      });
    }
    if (tickets >= 20) {
      out.push({
        rule: RECOMMENDATION_RULES.HEALTH_CHECK,
        priority: 'high',
        title: { he: 'בדיקת בריאות חשבון', en: 'Schedule an account health check' },
        rationale: {
          he: `נפח פניות גבוה (${tickets}) — זהה חיכוכים מערכתיים`,
          en: `High ticket volume (${tickets}) — identify systemic friction`,
        },
      });
    }
    if (renewalDate) {
      const daysToRenewal = Math.round((new Date(renewalDate).getTime() - nowMs) / MS_PER_DAY);
      if (daysToRenewal >= 0 && daysToRenewal <= 90) {
        out.push({
          rule: RECOMMENDATION_RULES.RENEWAL,
          priority: 'critical',
          title: { he: 'שיחת חידוש חוזה', en: 'Renewal conversation' },
          rationale: {
            he: `חידוש בעוד ${daysToRenewal} ימים — יזום שיחה עכשיו`,
            en: `Renewal in ${daysToRenewal} days — kick off conversation now`,
          },
        });
      }
    }
    return out;
  }

  /**
   * Render a self-contained HTML deck with inline CSS. RTL Hebrew primary,
   * LTR English side-by-side. Includes all 10 standard slides.
   */
  renderHTML(qbr, options = {}) {
    if (!qbr) throw new Error('qbr required');
    const theme = options.theme || 'palantir-dark';
    const bg = '#0b0d10', panel = '#13171c', accent = '#4a9eff', text = '#e6edf6', muted = '#9aa8bf';

    const data = this._qbrAsData(qbr);
    const slides = SLIDE_SECTION_ORDER.map((key) => this.buildSlide(key, data));
    const customerId = qbr.customerId || data.customerId || 'n/a';
    const quarterLabel = (qbr.quarter && qbr.quarter.label) || qbr.period || data.quarter || 'n/a';

    const esc = (v) => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const slideHtml = slides.map((s, idx) => {
      const heItems = (s.body.he || []).map((ln) => `<li>${esc(ln)}</li>`).join('');
      const enItems = (s.body.en || []).map((ln) => `<li>${esc(ln)}</li>`).join('');
      return `
  <section class="slide" id="slide-${idx + 1}">
    <header class="slide-header">
      <span class="slide-num">${idx + 1}/10</span>
      <h2 class="he">${esc(s.title.he)}</h2>
      <h2 class="en">${esc(s.title.en)}</h2>
    </header>
    <div class="slide-body">
      <div class="col he" dir="rtl" lang="he"><ul>${heItems}</ul></div>
      <div class="col en" dir="ltr" lang="en"><ul>${enItems}</ul></div>
    </div>
  </section>`;
    }).join('\n');

    return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<title>QBR — ${esc(customerId)} — ${esc(quarterLabel)}</title>
<meta name="theme" content="${esc(theme)}">
<style>
  html, body { margin: 0; padding: 0; background: ${bg}; color: ${text};
    font-family: "Rubik", "Heebo", "Inter", "IBM Plex Sans", Arial, sans-serif; }
  .deck { padding: 24px; max-width: 1200px; margin: 0 auto; }
  header.cover { background: ${panel}; border: 1px solid #1f2631; border-radius: 10px;
    padding: 32px; margin-bottom: 24px; }
  header.cover h1 { margin: 0 0 8px; color: ${accent}; font-size: 28px; }
  header.cover .subtitle { color: ${muted}; font-size: 14px; }
  section.slide { background: ${panel}; border: 1px solid #1f2631; border-radius: 10px;
    padding: 24px; margin-bottom: 18px; }
  .slide-header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 14px;
    border-bottom: 1px solid #1f2631; padding-bottom: 10px; }
  .slide-header h2 { margin: 0; font-size: 18px; }
  .slide-header h2.he { color: ${text}; }
  .slide-header h2.en { color: ${muted}; font-weight: 400; }
  .slide-num { color: ${accent}; font-family: "IBM Plex Mono", monospace; font-size: 12px;
    background: #1a2230; padding: 4px 8px; border-radius: 4px; }
  .slide-body { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .slide-body .col { background: #0f1318; border: 1px solid #1f2631; border-radius: 6px;
    padding: 14px 18px; }
  .slide-body .col.he { order: 1; }
  .slide-body .col.en { order: 2; color: ${muted}; }
  .slide-body ul { margin: 0; padding-inline-start: 18px; line-height: 1.6; font-size: 14px; }
  footer.deck-footer { color: ${muted}; font-size: 12px; text-align: center; margin-top: 24px; }
  .theme-tag { color: ${accent}; }
</style>
</head>
<body>
  <main class="deck" data-theme="${esc(theme)}">
    <header class="cover">
      <h1>סקירה עסקית רבעונית / Quarterly Business Review</h1>
      <div class="subtitle">
        <span>לקוח / Customer: <strong>${esc(customerId)}</strong></span>
        &nbsp;•&nbsp;
        <span>רבעון / Period: <strong>${esc(quarterLabel)}</strong></span>
        &nbsp;•&nbsp;
        <span class="theme-tag">${esc(theme)}</span>
      </div>
    </header>
${slideHtml}
    <footer class="deck-footer">Techno-Kol Uzi mega-ERP • Agent Y-104 • לא מוחקים רק משדרגים ומגדלים</footer>
  </main>
</body>
</html>`;
  }

  /**
   * Produce a structured payload for a downstream PDF renderer. The
   * payload is JSON-serialisable and renders the 10 standard slides.
   */
  renderPDF(qbr) {
    if (!qbr) throw new Error('qbr required');
    const data = this._qbrAsData(qbr);
    const slides = SLIDE_SECTION_ORDER.map((key) => this.buildSlide(key, data));
    const customerId = qbr.customerId || data.customerId || 'n/a';
    const quarterLabel = (qbr.quarter && qbr.quarter.label) || qbr.period || data.quarter || 'n/a';

    const pages = [
      {
        type: 'cover',
        title_he: 'סקירה עסקית רבעונית',
        title_en: 'Quarterly Business Review',
        subtitle_he: `לקוח ${customerId} — רבעון ${quarterLabel}`,
        subtitle_en: `Customer ${customerId} — Period ${quarterLabel}`,
        theme: 'palantir-dark',
      },
      ...slides.map((s, idx) => ({
        type: 'content',
        index: idx + 1,
        sectionKey: s.sectionKey,
        heading_he: s.title.he,
        heading_en: s.title.en,
        lines_he: s.body.he,
        lines_en: s.body.en,
        theme: 'palantir-dark',
        direction: { primary: 'rtl', secondary: 'ltr' },
      })),
    ];

    return {
      qbrId: qbr.id || null,
      format: 'palantir-dark-pdf',
      mimeType: 'application/pdf',
      filename: `QBR-${customerId}-${quarterLabel}.pdf`,
      pageCount: pages.length,
      pages,
      palette: { bg: '#0b0d10', panel: '#13171c', accent: '#4a9eff' },
      theme: 'palantir-dark',
    };
  }

  /**
   * Mark a QBR as archived. Preserves the original record — does not delete
   * and does not mutate the body — only appends to history + toggles status.
   */
  archiveQBR(qbrId) {
    const qbr = this._mustGet(qbrId);
    qbr.archived = true;
    qbr.archivedAt = this.now().toISOString();
    const prevStatus = qbr.status;
    qbr.status = QBR_STATUS.ARCHIVED;
    qbr.history = Array.isArray(qbr.history) ? qbr.history : [];
    qbr.history.push({
      at: qbr.archivedAt,
      status: QBR_STATUS.ARCHIVED,
      note: `archived (prev=${prevStatus})`,
    });
    this.store.saveQBR(qbr);
    return qbr;
  }

  /**
   * Return every past QBR for a customer, sorted by createdAt ascending
   * (append-only history — includes archived and superseded entries).
   */
  history(customerId) {
    if (!customerId) throw new Error('customerId required');
    const all = this.store.listQBRs(customerId);
    return all.slice().sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return ta - tb;
    });
  }

  /**
   * Quarter-over-quarter comparison for a customer. Accepts either two
   * quarter tokens ("2026-Q1") or two QBR records.
   */
  compareQuarters(customerId, q1, q2) {
    if (!customerId) throw new Error('customerId required');
    if (q1 == null || q2 == null) throw new Error('both quarters required');

    const load = (q) => {
      if (q && typeof q === 'object' && q.sections) return q;
      const label = typeof q === 'string' ? q : normalizeQuarter(q).label;
      const match = this.store.listQBRs(customerId)
        .filter((r) => r.quarter && r.quarter.label === label);
      if (match.length) {
        // Prefer non-superseded, non-archived record if any
        return match.find((r) => r.status === QBR_STATUS.ASSEMBLED) || match[match.length - 1];
      }
      // Fallback: assemble a shadow QBR from pulled data (read-only, not saved)
      const bundle = this.pullData(customerId, label);
      return { customerId, quarter: bundle.quarter, sections: {
        [SECTIONS.USAGE_METRICS]:   this._sectUsage({ data: bundle, customerId, quarter: bundle.quarter }),
        [SECTIONS.SUPPORT_SUMMARY]: this._sectSupport({ data: bundle, customerId, quarter: bundle.quarter }),
        [SECTIONS.HEALTH_SCORE]:    this._sectHealth({ data: bundle, customerId, quarter: bundle.quarter }),
        [SECTIONS.GOALS]:           this._sectGoals({ data: bundle, customerId, quarter: bundle.quarter }),
        [SECTIONS.BUSINESS_IMPACT]: this._sectBusinessImpact({ data: bundle, customerId, quarter: bundle.quarter }),
      } };
    };

    const a = load(q1);
    const b = load(q2);

    const numDelta = (x, y) => {
      if (x == null || y == null) return null;
      return +(Number(y) - Number(x)).toFixed(2);
    };
    const pctDelta = (x, y) => {
      if (!x || y == null) return null;
      return +(((Number(y) - Number(x)) / Math.abs(Number(x))) * 100).toFixed(1);
    };

    const usageA   = (a.sections && a.sections[SECTIONS.USAGE_METRICS])   || {};
    const usageB   = (b.sections && b.sections[SECTIONS.USAGE_METRICS])   || {};
    const supportA = (a.sections && a.sections[SECTIONS.SUPPORT_SUMMARY]) || {};
    const supportB = (b.sections && b.sections[SECTIONS.SUPPORT_SUMMARY]) || {};
    const healthA  = (a.sections && a.sections[SECTIONS.HEALTH_SCORE])    || {};
    const healthB  = (b.sections && b.sections[SECTIONS.HEALTH_SCORE])    || {};
    const goalsA   = (a.sections && a.sections[SECTIONS.GOALS])           || {};
    const goalsB   = (b.sections && b.sections[SECTIONS.GOALS])           || {};

    return {
      customerId,
      from: (a.quarter && a.quarter.label) || q1,
      to:   (b.quarter && b.quarter.label) || q2,
      usage: {
        activeUsers: { from: usageA.activeUsers || 0, to: usageB.activeUsers || 0,
          delta: numDelta(usageA.activeUsers, usageB.activeUsers),
          deltaPct: pctDelta(usageA.activeUsers || 0, usageB.activeUsers || 0) },
        logins:      { from: usageA.logins || 0, to: usageB.logins || 0,
          delta: numDelta(usageA.logins, usageB.logins) },
        features:    { from: usageA.featuresCount || 0, to: usageB.featuresCount || 0,
          delta: numDelta(usageA.featuresCount || 0, usageB.featuresCount || 0) },
      },
      support: {
        opened: { from: supportA.opened || 0, to: supportB.opened || 0,
          delta: numDelta(supportA.opened, supportB.opened) },
        csat:   { from: supportA.csat, to: supportB.csat, delta: numDelta(supportA.csat, supportB.csat) },
        nps:    { from: supportA.nps,  to: supportB.nps,  delta: numDelta(supportA.nps,  supportB.nps) },
      },
      health: {
        score: { from: healthA.score, to: healthB.score, delta: numDelta(healthA.score, healthB.score) },
      },
      goals: {
        achieved: { from: (goalsA.counts && goalsA.counts.achieved) || 0,
                    to:   (goalsB.counts && goalsB.counts.achieved) || 0 },
        total:    { from: goalsA.total || 0, to: goalsB.total || 0 },
      },
      labels: {
        he: { title: `השוואה רבעונית: ${q1} → ${q2}`, customer: customerId },
        en: { title: `Quarter comparison: ${q1} → ${q2}`, customer: customerId },
      },
    };
  }

  /**
   * Convert a QBR record into a flattened data bundle that `buildSlide`
   * understands. Tolerates two shapes: the legacy stored record and an
   * inline-assembled object.
   */
  _qbrAsData(qbr) {
    const data = {
      customerId: qbr.customerId || null,
      quarter:    (qbr.quarter && qbr.quarter.label) || qbr.period || null,
      period:     (qbr.quarter && qbr.quarter.label) || qbr.period || null,
    };
    if (qbr.sections) {
      const u = qbr.sections[SECTIONS.USAGE_METRICS]   || {};
      const s = qbr.sections[SECTIONS.SUPPORT_SUMMARY] || {};
      const h = qbr.sections[SECTIONS.HEALTH_SCORE]    || {};
      const g = qbr.sections[SECTIONS.GOALS]           || {};
      const r = qbr.sections[SECTIONS.ROADMAP]         || {};
      const ac = qbr.sections[SECTIONS.ASKS_COMMITMENTS] || {};
      const ng = qbr.sections[SECTIONS.NEXT_QUARTER_GOALS] || {};
      data.usage   = { logins: u.logins, activeUsers: u.activeUsers,
                       eventsTotal: u.eventsTotal,
                       featuresUsed: u.featuresUsed,
                       valueDelivered: u.valueDelivered };
      data.support = { opened: s.opened, closed: s.closed,
                       p1Count: s.p1Count, avgResolutionHours: s.avgResolutionHours,
                       csat: s.csat, nps: s.nps, escalations: s.escalations };
      data.health  = { score: h.score, band: h.band };
      data.goals   = Array.isArray(g.items) ? g.items : [];
      data.roadmap = Array.isArray(r.items) ? r.items : [];
      data.asks    = Array.isArray(ac.asks) ? ac.asks : [];
      data.nextSteps = Array.isArray(ng.items) ? ng.items : [];
    }
    // Merge billing if present on the bundle (pullData path)
    if (qbr.billing) data.billing = qbr.billing;
    if (qbr.usage && !data.usage) data.usage = qbr.usage;
    if (qbr.support && !data.support) data.support = qbr.support;
    if (qbr.health && !data.health) data.health = qbr.health;
    return data;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  QBRGenerator,
  SECTIONS,
  SECTION_ORDER,
  SLIDE_SECTIONS,
  SLIDE_SECTION_ORDER,
  SLIDE_TITLES,
  RECOMMENDATION_RULES,
  HEALTH_BAND,
  QBR_STATUS,
  COMMITMENT_STATUS,
  GOAL_STATUS,
  ACTION_OWNER,
  LABELS,
  PALANTIR_THEME,
  createMemoryStore,
  createStubModules,
  normalizeQuarter,
  computeHealthScore,
  bandOf,
};
