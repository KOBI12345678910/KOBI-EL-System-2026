/**
 * Performance Review Engine — Templates, Calibration, 360°, PIP, PDI
 * Agent Y-065 • Techno-Kol Uzi • Kobi's mega-ERP • 2026-04-11
 *
 * A zero-dependency performance-review engine for an Israeli HR
 * department. Handles the full annual / semi-annual review life cycle:
 *
 *   templates  → schedule  → submit  → calibrate  → comp link
 *                                   ↘ 360° aggregate
 *                                   ↘ PIP trigger (חוק שימוע הוגן)
 *                                   ↘ PDI export (Personal Development Plan)
 *                                   ↘ multi-year history (never purged)
 *                                   ↘ bilingual roll-up reports
 *
 * Principle (Kobi's law):
 *   "לא מוחקים רק משדרגים ומגדלים"
 *   — NEVER delete. Statuses move forward only:
 *       draft → submitted → calibrated → archived
 *     plus PIP / 360 / comp-link annotations are *appended* to the
 *     review record, never replacing prior data.
 *
 * Israeli labor-law context (PIP / שימוע הוגן):
 *   Before an Israeli employer may consider termination on performance
 *   grounds, case-law (פס"ד מילפלדר, נון, ועוד) and the duty of
 *   good-faith require:
 *     1. Written notice of the performance gap (התראה בכתב)
 *     2. A genuine opportunity to improve, with clear KPIs
 *     3. A mentor / manager assigned to coach
 *     4. A reasonable improvement window — 3 to 6 months
 *     5. A fair "שימוע" (hearing) before any decision is taken
 *   `flagPerformanceIssue` and `triggerPIP` enforce these gates.
 *
 * Bilingual: every user-facing label is { he, en }.
 * Zero deps: only `node:crypto` (built-in) is used, for ids and 360 hashes.
 *
 * Public API (PerformanceReview class):
 *   defineTemplate({...})
 *   scheduleReview({...})
 *   submitReview({...})            — append-only, weighted overall score
 *   calibrate({...})               — forced bell-curve distribution
 *   generate360Feedback({...})     — k-anon aggregation, no identity reveal
 *   linkToCompGrade(reviewId, gradeChange)
 *   exportPDI(employeeId)          — Personal Development Plan
 *   flagPerformanceIssue(reviewId, severity, action)
 *   triggerPIP(reviewId, opts)     — explicit PIP creator (used by flag)
 *   recordPIPMilestone(pipId, ms)  — append-only PIP progress
 *   completePIP(pipId, outcome)    — successful / extend / terminate
 *   history(employeeId)            — multi-year history
 *   generateReport(period, filter) — bilingual roll-up
 *   archive(reviewId, reason)      — soft-archive (status only)
 *   getReview(reviewId)            — read helper
 *   getTemplate(templateId)        — read helper
 *   getPIP(pipId)                  — read helper
 *   listReviews(filter)            — read helper
 *
 * Constants exported:
 *   STATUS, BELL_CURVE, PIP_SEVERITY, REVIEWER_KIND,
 *   K_ANON, LABELS, MIN_PIP_DAYS, MAX_PIP_DAYS
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Lifecycle of a single review — append-only forward transitions only. */
const STATUS = Object.freeze({
  DRAFT:      'draft',
  SCHEDULED:  'scheduled',
  SUBMITTED:  'submitted',
  CALIBRATED: 'calibrated',
  ARCHIVED:   'archived',
});

/** Allowed forward transitions — used by setStatus to enforce monotonicity. */
const STATUS_ORDER = Object.freeze({
  draft:      0,
  scheduled:  1,
  submitted:  2,
  calibrated: 3,
  archived:   4,
});

/** Default forced-distribution bell curve (10/20/40/20/10). */
const BELL_CURVE = Object.freeze({
  // Buckets are listed top → bottom so bucket[0] = top performers.
  buckets: Object.freeze([
    { id: 'top',          he: 'מצטיינים',          en: 'Top performers',     pct: 0.10 },
    { id: 'above',        he: 'מעל הציפיות',       en: 'Above expectations', pct: 0.20 },
    { id: 'meets',        he: 'עומד בציפיות',      en: 'Meets expectations', pct: 0.40 },
    { id: 'below',        he: 'מתחת לציפיות',      en: 'Below expectations', pct: 0.20 },
    { id: 'unsatisfactory',he:'לא משביע רצון',     en: 'Unsatisfactory',     pct: 0.10 },
  ]),
});

/** Severity levels for performance flagging. */
const PIP_SEVERITY = Object.freeze({
  minor:    { he: 'קלה',     en: 'Minor',    pipDays: 0,   requiresPIP: false },
  moderate: { he: 'בינונית', en: 'Moderate', pipDays: 90,  requiresPIP: true  },
  serious:  { he: 'חמורה',   en: 'Serious',  pipDays: 120, requiresPIP: true  },
  critical: { he: 'קריטית',  en: 'Critical', pipDays: 180, requiresPIP: true  },
});

/** Recognised 360° reviewer roles. */
const REVIEWER_KIND = Object.freeze({
  SELF:        'self',
  MANAGER:     'manager',
  PEER:        'peer',
  SUBORDINATE: 'subordinate',
  SKIP_LEVEL:  'skipLevel',
  CLIENT:      'client',
});

/** k-anonymity floor for 360 aggregation (groups smaller than k are redacted). */
const K_ANON = 3;

/** Minimum / maximum PIP window per Israeli case law (3-6 months). */
const MIN_PIP_DAYS = 90;
const MAX_PIP_DAYS = 180;

/** Bilingual labels — used by reports, exports and PDIs. */
const LABELS = Object.freeze({
  he: {
    review:               'הערכת ביצועים',
    employee:             'עובד/ת',
    reviewer:             'מעריך',
    period:               'תקופה',
    template:             'תבנית',
    competencies:         'יכולות',
    weight:               'משקל',
    score:                'ציון',
    overall:              'ציון כולל',
    rubric:               'סולם דירוג',
    self_assessment:      'הערכה עצמית',
    comments:             'הערות',
    attachments:          'קבצים מצורפים',
    bell_curve:           'התפלגות מאולצת (פעמון)',
    bucket:               'מקטע',
    actual:               'בפועל',
    expected:             'יעד',
    adjustment:           'התאמה',
    calibration:          'כיול',
    feedback_360:         'משוב 360 מעלות',
    aggregated:           'מצטבר',
    by_kind:              'לפי סוג מעריך',
    redacted_anonymity:   'חסוי — פחות מ-3 משיבים',
    pip:                  'תוכנית שיפור ביצועים',
    pip_required:         'נדרשת תוכנית שיפור ביצועים',
    pip_milestone:        'אבן דרך',
    pip_kpi:              'מדד הצלחה',
    pip_mentor:           'מנטור',
    pip_window:           'חלון שיפור',
    pip_outcome:          'תוצאה',
    pip_extended:         'הוארך',
    pip_completed:        'הושלם בהצלחה',
    pip_terminated:       'הוחלט על סיום העסקה',
    written_notice:       'התראה בכתב',
    fair_hearing:         'שימוע הוגן',
    pdi:                  'תוכנית פיתוח אישית',
    goals:                'יעדים',
    training:             'הכשרות מומלצות',
    history:              'היסטוריה רב-שנתית',
    report:               'דו"ח',
    department:           'מחלקה',
    manager:              'מנהל ישיר',
    comp_grade:           'דרגת שכר',
    grade_change:         'שינוי דרגה',
    salary_band:          'טווח שכר',
    status_draft:         'טיוטה',
    status_scheduled:     'מתוזמן',
    status_submitted:     'הוגש',
    status_calibrated:    'כויל',
    status_archived:      'בארכיון',
    severity:             'חומרה',
    action:               'פעולה',
  },
  en: {
    review:               'Performance review',
    employee:             'Employee',
    reviewer:             'Reviewer',
    period:               'Period',
    template:             'Template',
    competencies:         'Competencies',
    weight:               'Weight',
    score:                'Score',
    overall:              'Overall score',
    rubric:               'Rubric',
    self_assessment:      'Self-assessment',
    comments:             'Comments',
    attachments:          'Attachments',
    bell_curve:           'Forced distribution (bell curve)',
    bucket:               'Bucket',
    actual:               'Actual',
    expected:             'Expected',
    adjustment:           'Adjustment',
    calibration:          'Calibration',
    feedback_360:         '360° Feedback',
    aggregated:           'Aggregated',
    by_kind:              'By reviewer kind',
    redacted_anonymity:   'Redacted — fewer than 3 respondents',
    pip:                  'Performance Improvement Plan',
    pip_required:         'Performance Improvement Plan required',
    pip_milestone:        'Milestone',
    pip_kpi:              'KPI',
    pip_mentor:           'Mentor',
    pip_window:           'Improvement window',
    pip_outcome:          'Outcome',
    pip_extended:         'Extended',
    pip_completed:        'Completed successfully',
    pip_terminated:       'Termination decided',
    written_notice:       'Written notice',
    fair_hearing:         'Fair hearing (שימוע)',
    pdi:                  'Personal Development Plan',
    goals:                'Goals',
    training:             'Recommended training',
    history:              'Multi-year history',
    report:               'Report',
    department:           'Department',
    manager:              'Line manager',
    comp_grade:           'Compensation grade',
    grade_change:         'Grade change',
    salary_band:          'Salary band',
    status_draft:         'Draft',
    status_scheduled:     'Scheduled',
    status_submitted:     'Submitted',
    status_calibrated:    'Calibrated',
    status_archived:      'Archived',
    severity:             'Severity',
    action:               'Action',
  },
});

// ═══════════════════════════════════════════════════════════════
// HELPERS — pure, no I/O
// ═══════════════════════════════════════════════════════════════

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function defaultClock() {
  return new Date();
}

function defaultRandomId(prefix) {
  const rand = crypto.randomBytes(8).toString('hex');
  return `${prefix}-${Date.now()}-${rand}`;
}

function snap(obj) {
  if (obj === null || obj === undefined) return obj;
  // Deep clone via JSON — sufficient for plain data shapes used here.
  return JSON.parse(JSON.stringify(obj));
}

function parseDate(d) {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid date: ${d}`);
  }
  return dt;
}

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Stable hash — used to deterministically anonymise reviewer ids in 360°. */
function hashId(id, salt) {
  return crypto
    .createHash('sha256')
    .update(`${salt}::${id}`)
    .digest('hex')
    .slice(0, 12);
}

// ═══════════════════════════════════════════════════════════════
// PerformanceReview — main engine
// ═══════════════════════════════════════════════════════════════

class PerformanceReview {
  /**
   * @param {object} [opts]
   * @param {() => Date} [opts.clock]
   * @param {(prefix: string) => string} [opts.randomId]
   * @param {string} [opts.anonSalt] — salt used for 360 reviewer hashes
   */
  constructor(opts = {}) {
    this.clock = opts.clock || defaultClock;
    this.randomId = opts.randomId || defaultRandomId;
    this.anonSalt = opts.anonSalt || crypto.randomBytes(16).toString('hex');

    /** @type {Map<string, object>} templates by id */
    this.templates = new Map();
    /** @type {Map<string, object>} reviews by id */
    this.reviews = new Map();
    /** @type {Map<string, string[]>} reviews per employee, ordered by createdAt */
    this.reviewsByEmployee = new Map();
    /** @type {Map<string, object>} 360 feedback bundles per reviewId */
    this.feedback360 = new Map();
    /** @type {Map<string, object>} PIP records by id */
    this.pips = new Map();
    /** @type {Map<string, string>} reviewId → pipId */
    this.pipByReview = new Map();
    /** @type {Array<object>} append-only audit log */
    this.audit = [];
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNAL: audit + status enforcement
  // ─────────────────────────────────────────────────────────────

  _audit(action, payload) {
    this.audit.push({
      at: this.clock().toISOString(),
      action,
      payload: snap(payload),
    });
  }

  _setStatus(review, next) {
    const cur = STATUS_ORDER[review.status];
    const nxt = STATUS_ORDER[next];
    if (typeof nxt !== 'number') {
      throw new Error(`Unknown status "${next}"`);
    }
    if (nxt < cur) {
      // Kobi's law — never roll back.
      throw new Error(
        `Cannot move review "${review.id}" backwards from ${review.status} → ${next}`,
      );
    }
    review.status = next;
    review.statusHistory = review.statusHistory || [];
    review.statusHistory.push({
      status: next,
      at: this.clock().toISOString(),
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 1. defineTemplate
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} spec.id
   * @param {string} spec.name_he
   * @param {string} spec.name_en
   * @param {Array<{id, label_he, label_en, weight, rubric}>} spec.competencies
   * @param {5|10} [spec.scale=5]
   */
  defineTemplate(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('defineTemplate: spec object required');
    }
    if (!isNonEmptyString(spec.id)) throw new Error('defineTemplate: id required');
    if (!isNonEmptyString(spec.name_he)) throw new Error('defineTemplate: name_he required');
    if (!isNonEmptyString(spec.name_en)) throw new Error('defineTemplate: name_en required');
    if (!Array.isArray(spec.competencies) || spec.competencies.length === 0) {
      throw new Error('defineTemplate: at least one competency required');
    }
    const scale = spec.scale === 10 ? 10 : 5;

    const competencies = spec.competencies.map((c, idx) => {
      if (!isNonEmptyString(c.id)) {
        throw new Error(`defineTemplate: competency[${idx}].id required`);
      }
      if (!isNonEmptyString(c.label_he) || !isNonEmptyString(c.label_en)) {
        throw new Error(`defineTemplate: competency[${idx}] must have bilingual label`);
      }
      const weight = isFiniteNumber(c.weight) && c.weight > 0 ? c.weight : 1;
      return {
        id: c.id,
        label_he: c.label_he,
        label_en: c.label_en,
        weight,
        rubric: c.rubric ? snap(c.rubric) : null,
      };
    });

    // Re-defining a template id is allowed but only as an *upgrade*: we
    // version-bump and append a new record. The previous version is kept
    // (Kobi's law). Each call increments the version counter.
    const existing = this.templates.get(spec.id);
    const version = existing ? (existing.version || 1) + 1 : 1;

    const template = {
      id: spec.id,
      name_he: spec.name_he,
      name_en: spec.name_en,
      scale,
      competencies,
      version,
      createdAt: this.clock().toISOString(),
      previousVersion: existing ? snap(existing) : null,
    };
    this.templates.set(spec.id, template);
    this._audit('defineTemplate', { id: spec.id, version });
    return snap(template);
  }

  getTemplate(id) {
    return snap(this.templates.get(id));
  }

  // ─────────────────────────────────────────────────────────────
  // 2. scheduleReview
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} spec.employeeId
   * @param {string} spec.templateId
   * @param {string} spec.reviewerId
   * @param {string} spec.period   — free-form e.g. "2026-H1" or "2025-Q4"
   * @param {string|Date} spec.dueDate
   * @param {string} [spec.departmentId]
   * @param {string} [spec.managerId]
   */
  scheduleReview(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('scheduleReview: spec object required');
    }
    if (!isNonEmptyString(spec.employeeId)) throw new Error('scheduleReview: employeeId required');
    if (!isNonEmptyString(spec.templateId)) throw new Error('scheduleReview: templateId required');
    if (!isNonEmptyString(spec.reviewerId)) throw new Error('scheduleReview: reviewerId required');
    if (!isNonEmptyString(spec.period)) throw new Error('scheduleReview: period required');
    if (!spec.dueDate) throw new Error('scheduleReview: dueDate required');

    const template = this.templates.get(spec.templateId);
    if (!template) {
      throw new Error(`scheduleReview: templateId "${spec.templateId}" not found`);
    }

    const id = this.randomId('rev');
    const review = {
      id,
      employeeId: spec.employeeId,
      templateId: spec.templateId,
      templateVersion: template.version,
      reviewerId: spec.reviewerId,
      period: spec.period,
      departmentId: spec.departmentId || null,
      managerId: spec.managerId || null,
      dueDate: parseDate(spec.dueDate).toISOString(),
      createdAt: this.clock().toISOString(),
      status: STATUS.DRAFT,
      statusHistory: [{ status: STATUS.DRAFT, at: this.clock().toISOString() }],
      scores: null,
      comments: null,
      attachments: null,
      selfAssessment: null,
      overall: null,
      submittedAt: null,
      calibration: null,
      compLink: null,
      flags: [],
      pipId: null,
    };

    this._setStatus(review, STATUS.SCHEDULED);
    this.reviews.set(id, review);

    if (!this.reviewsByEmployee.has(spec.employeeId)) {
      this.reviewsByEmployee.set(spec.employeeId, []);
    }
    this.reviewsByEmployee.get(spec.employeeId).push(id);

    this._audit('scheduleReview', { id, employeeId: spec.employeeId, period: spec.period });
    return snap(review);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. submitReview — append-only, calculates weighted overall
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} spec.reviewId
   * @param {Record<string, number>} spec.scores  — keyed by competency id
   * @param {Record<string, string>|string} [spec.comments]
   * @param {Array<{name, url}>} [spec.attachments]
   * @param {object} [spec.selfAssessment]
   */
  submitReview(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('submitReview: spec object required');
    }
    const review = this.reviews.get(spec.reviewId);
    if (!review) throw new Error(`submitReview: reviewId "${spec.reviewId}" not found`);
    if (review.status === STATUS.ARCHIVED) {
      throw new Error(`submitReview: review "${review.id}" is archived`);
    }
    if (!spec.scores || typeof spec.scores !== 'object') {
      throw new Error('submitReview: scores object required');
    }

    const template = this.templates.get(review.templateId);
    if (!template) {
      throw new Error(`submitReview: template "${review.templateId}" missing`);
    }

    // Validate every competency is scored within scale.
    const cleanScores = {};
    for (const c of template.competencies) {
      const raw = spec.scores[c.id];
      if (!isFiniteNumber(raw)) {
        throw new Error(`submitReview: missing score for competency "${c.id}"`);
      }
      if (raw < 1 || raw > template.scale) {
        throw new Error(
          `submitReview: score for "${c.id}" must be 1..${template.scale}, got ${raw}`,
        );
      }
      cleanScores[c.id] = raw;
    }

    // Weighted overall: sum(score * weight) / sum(weights).
    let weightedSum = 0;
    let weightTotal = 0;
    for (const c of template.competencies) {
      weightedSum += cleanScores[c.id] * c.weight;
      weightTotal += c.weight;
    }
    const overall = weightTotal > 0 ? round(weightedSum / weightTotal, 4) : 0;

    // Append-only: NEVER overwrite a previous submission. We push to a
    // submissions array and treat the LAST entry as the canonical one.
    const submission = {
      submittedAt: this.clock().toISOString(),
      scores: cleanScores,
      comments: spec.comments ? snap(spec.comments) : null,
      attachments: Array.isArray(spec.attachments) ? snap(spec.attachments) : null,
      selfAssessment: spec.selfAssessment ? snap(spec.selfAssessment) : null,
      overall,
      overallNormalized: round(overall / template.scale, 4),
    };
    review.submissions = review.submissions || [];
    review.submissions.push(submission);

    // Mirror canonical fields onto the review for fast access.
    review.scores = submission.scores;
    review.comments = submission.comments;
    review.attachments = submission.attachments;
    review.selfAssessment = submission.selfAssessment;
    review.overall = overall;
    review.overallNormalized = submission.overallNormalized;
    review.submittedAt = submission.submittedAt;

    if (review.status === STATUS.DRAFT || review.status === STATUS.SCHEDULED) {
      this._setStatus(review, STATUS.SUBMITTED);
    }

    this._audit('submitReview', { id: review.id, overall });
    return snap(review);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. calibrate — forced bell-curve distribution
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} spec.managerId
   * @param {string} spec.period
   * @param {object} [spec.rule]
   * @param {'bell'} [spec.rule.kind='bell']
   * @param {Array<{id, pct}>} [spec.rule.buckets] — override default 10/20/40/20/10
   */
  calibrate(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('calibrate: spec object required');
    }
    if (!isNonEmptyString(spec.managerId)) throw new Error('calibrate: managerId required');
    if (!isNonEmptyString(spec.period)) throw new Error('calibrate: period required');

    const rule = spec.rule || { kind: 'bell' };
    const buckets = Array.isArray(rule.buckets) && rule.buckets.length > 0
      ? rule.buckets
      : BELL_CURVE.buckets.map(b => ({ id: b.id, pct: b.pct, he: b.he, en: b.en }));

    // Validate the buckets sum to ~1.
    const sum = buckets.reduce((s, b) => s + b.pct, 0);
    if (Math.abs(sum - 1) > 0.01) {
      throw new Error(`calibrate: bucket percentages must sum to 1, got ${sum}`);
    }

    // Find every submitted review for this manager + period.
    const eligible = [];
    for (const r of this.reviews.values()) {
      if (r.period !== spec.period) continue;
      if (r.managerId !== spec.managerId && r.reviewerId !== spec.managerId) continue;
      if (r.status !== STATUS.SUBMITTED && r.status !== STATUS.CALIBRATED) continue;
      eligible.push(r);
    }
    if (eligible.length === 0) {
      throw new Error(
        `calibrate: no submitted reviews for managerId="${spec.managerId}" period="${spec.period}"`,
      );
    }

    // Sort top → bottom by overallNormalized, breaking ties by id for stability.
    const sorted = eligible.slice().sort((a, b) => {
      if (b.overallNormalized !== a.overallNormalized) {
        return b.overallNormalized - a.overallNormalized;
      }
      return a.id.localeCompare(b.id);
    });

    const n = sorted.length;
    // Compute integer bucket sizes that sum to n. We round each pct*n
    // and absorb the rounding error in the largest "meets" bucket.
    const sizes = buckets.map(b => Math.round(b.pct * n));
    let sizesTotal = sizes.reduce((s, x) => s + x, 0);
    // Fix off-by-one rounding by adjusting the middle "meets" bucket
    // (or bucket index 2 if no "meets" id).
    let middleIdx = buckets.findIndex(b => b.id === 'meets');
    if (middleIdx < 0) middleIdx = Math.floor(buckets.length / 2);
    sizes[middleIdx] += (n - sizesTotal);
    if (sizes[middleIdx] < 0) sizes[middleIdx] = 0;
    sizesTotal = sizes.reduce((s, x) => s + x, 0);

    // Walk sorted reviews and apply bucket assignments. We also generate
    // an "adjustments" report so the manager can see who moved.
    const adjustments = [];
    const assignments = [];
    let cursor = 0;
    for (let bi = 0; bi < buckets.length; bi += 1) {
      const bucket = buckets[bi];
      const take = sizes[bi];
      for (let k = 0; k < take && cursor < sorted.length; k += 1) {
        const review = sorted[cursor];
        const previousBucket = review.calibration ? review.calibration.bucket : null;
        const calibration = {
          calibratedAt: this.clock().toISOString(),
          managerId: spec.managerId,
          period: spec.period,
          bucket: bucket.id,
          bucket_he: bucket.he || null,
          bucket_en: bucket.en || null,
          rank: cursor + 1,
          totalCohort: n,
          rule: snap(rule),
        };
        review.calibration = calibration;
        review.calibrationHistory = review.calibrationHistory || [];
        review.calibrationHistory.push(calibration);
        if (review.status !== STATUS.CALIBRATED) {
          this._setStatus(review, STATUS.CALIBRATED);
        }
        assignments.push({
          reviewId: review.id,
          employeeId: review.employeeId,
          overall: review.overall,
          bucket: bucket.id,
          rank: cursor + 1,
        });
        if (previousBucket && previousBucket !== bucket.id) {
          adjustments.push({
            reviewId: review.id,
            employeeId: review.employeeId,
            from: previousBucket,
            to: bucket.id,
          });
        }
        cursor += 1;
      }
    }

    const result = {
      managerId: spec.managerId,
      period: spec.period,
      cohortSize: n,
      buckets: buckets.map((b, i) => ({
        id: b.id,
        he: b.he || null,
        en: b.en || null,
        expected: sizes[i],
        actualPct: round(sizes[i] / n, 4),
        targetPct: b.pct,
      })),
      assignments,
      adjustments,
      calibratedAt: this.clock().toISOString(),
    };
    this._audit('calibrate', { managerId: spec.managerId, period: spec.period, n });
    return snap(result);
  }

  // ─────────────────────────────────────────────────────────────
  // 5. generate360Feedback — anonymous aggregation
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} spec.employeeId
   * @param {Array<{reviewerId, kind, scores, comment?}>} spec.reviewers
   * @param {boolean} [spec.anonymous=true]
   * @param {string} [spec.reviewId] — optional anchor to a scheduled review
   * @param {string} [spec.period]
   */
  generate360Feedback(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('generate360Feedback: spec object required');
    }
    if (!isNonEmptyString(spec.employeeId)) {
      throw new Error('generate360Feedback: employeeId required');
    }
    if (!Array.isArray(spec.reviewers) || spec.reviewers.length === 0) {
      throw new Error('generate360Feedback: at least one reviewer required');
    }
    const anonymous = spec.anonymous !== false; // default true

    // Validate each reviewer entry.
    const validKinds = new Set(Object.values(REVIEWER_KIND));
    const cleaned = spec.reviewers.map((r, idx) => {
      if (!isNonEmptyString(r.reviewerId)) {
        throw new Error(`generate360Feedback: reviewers[${idx}].reviewerId required`);
      }
      if (!validKinds.has(r.kind)) {
        throw new Error(
          `generate360Feedback: reviewers[${idx}].kind must be one of ${[...validKinds].join(', ')}`,
        );
      }
      if (!r.scores || typeof r.scores !== 'object') {
        throw new Error(`generate360Feedback: reviewers[${idx}].scores object required`);
      }
      return {
        // The hash is one-way; even the storage layer can't reverse it.
        anonId: anonymous ? hashId(r.reviewerId, this.anonSalt) : r.reviewerId,
        kind: r.kind,
        scores: snap(r.scores),
        comment: r.comment ? String(r.comment) : null,
      };
    });

    // Aggregate per kind (avg score per competency) WITHOUT exposing
    // individual reviewer ids. Self group is never k-constrained.
    const byKind = {};
    for (const r of cleaned) {
      if (!byKind[r.kind]) byKind[r.kind] = [];
      byKind[r.kind].push(r);
    }

    const aggregated = {};
    const counts = {};
    for (const kind of Object.keys(byKind)) {
      const group = byKind[kind];
      counts[kind] = group.length;

      // Build {competencyId: [scores]}.
      const perComp = {};
      for (const r of group) {
        for (const [compId, val] of Object.entries(r.scores)) {
          if (!isFiniteNumber(val)) continue;
          if (!perComp[compId]) perComp[compId] = [];
          perComp[compId].push(val);
        }
      }

      // k-anonymity: any non-self group with fewer than K_ANON members is
      // returned as `redacted`. The COUNT is still returned (the spec
      // requires exposing reviewer counts).
      const constrained = kind !== REVIEWER_KIND.SELF && group.length < K_ANON;
      if (constrained) {
        aggregated[kind] = {
          count: group.length,
          redacted: true,
          reason: 'k-anonymity',
        };
        continue;
      }

      const out = {};
      for (const [compId, vals] of Object.entries(perComp)) {
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        out[compId] = round(avg, 3);
      }
      aggregated[kind] = {
        count: group.length,
        scores: out,
      };
    }

    const bundle = {
      id: this.randomId('360'),
      employeeId: spec.employeeId,
      period: spec.period || null,
      reviewId: spec.reviewId || null,
      anonymous,
      generatedAt: this.clock().toISOString(),
      reviewerCount: cleaned.length,
      countsByKind: counts,
      aggregated,
      // We also store a non-identifying record of every reviewer hash so
      // duplicates can be detected without revealing identity.
      reviewerHashes: cleaned.map(r => ({ anonId: r.anonId, kind: r.kind })),
    };

    if (spec.reviewId) {
      const review = this.reviews.get(spec.reviewId);
      if (review) {
        review.feedback360Id = bundle.id;
      }
    }
    this.feedback360.set(bundle.id, bundle);
    this._audit('generate360Feedback', {
      id: bundle.id,
      employeeId: spec.employeeId,
      reviewerCount: cleaned.length,
    });
    return snap(bundle);
  }

  // ─────────────────────────────────────────────────────────────
  // 6. linkToCompGrade
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {string} reviewId
   * @param {object} gradeChange
   * @param {string} gradeChange.fromGrade
   * @param {string} gradeChange.toGrade
   * @param {number} [gradeChange.salaryFrom]
   * @param {number} [gradeChange.salaryTo]
   * @param {string} [gradeChange.reason]
   * @param {string|Date} [gradeChange.effectiveDate]
   */
  linkToCompGrade(reviewId, gradeChange) {
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`linkToCompGrade: reviewId "${reviewId}" not found`);
    if (!gradeChange || typeof gradeChange !== 'object') {
      throw new Error('linkToCompGrade: gradeChange object required');
    }
    if (!isNonEmptyString(gradeChange.fromGrade) || !isNonEmptyString(gradeChange.toGrade)) {
      throw new Error('linkToCompGrade: fromGrade and toGrade required');
    }

    let salaryDelta = null;
    if (
      isFiniteNumber(gradeChange.salaryFrom) &&
      isFiniteNumber(gradeChange.salaryTo)
    ) {
      salaryDelta = round(gradeChange.salaryTo - gradeChange.salaryFrom, 2);
    }

    const link = {
      reviewId,
      fromGrade: gradeChange.fromGrade,
      toGrade: gradeChange.toGrade,
      salaryFrom: isFiniteNumber(gradeChange.salaryFrom) ? gradeChange.salaryFrom : null,
      salaryTo: isFiniteNumber(gradeChange.salaryTo) ? gradeChange.salaryTo : null,
      salaryDelta,
      reason: gradeChange.reason || null,
      effectiveDate: gradeChange.effectiveDate
        ? parseDate(gradeChange.effectiveDate).toISOString()
        : this.clock().toISOString(),
      linkedAt: this.clock().toISOString(),
    };
    // Append-only: if the review already had a comp link, keep history.
    review.compLinkHistory = review.compLinkHistory || [];
    if (review.compLink) review.compLinkHistory.push(review.compLink);
    review.compLink = link;
    this._audit('linkToCompGrade', { reviewId, fromGrade: link.fromGrade, toGrade: link.toGrade });
    return snap(link);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. exportPDI — Personal Development Plan
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {string} employeeId
   * @param {object} [opts]
   * @param {string} [opts.period] — limit to a specific period
   */
  exportPDI(employeeId, opts = {}) {
    if (!isNonEmptyString(employeeId)) {
      throw new Error('exportPDI: employeeId required');
    }
    const reviewIds = this.reviewsByEmployee.get(employeeId) || [];
    if (reviewIds.length === 0) {
      // Return an empty plan rather than throwing — the employee may be new.
      return {
        employeeId,
        generatedAt: this.clock().toISOString(),
        labels: { he: LABELS.he.pdi, en: LABELS.en.pdi },
        period: opts.period || null,
        reviewsConsidered: 0,
        strengths: [],
        weaknesses: [],
        goals: [],
        training: [],
      };
    }

    // Pull the most recent submitted review (or the one for the period).
    const candidates = reviewIds
      .map(id => this.reviews.get(id))
      .filter(r => r && r.status !== STATUS.ARCHIVED && r.overall !== null);
    const filtered = opts.period
      ? candidates.filter(r => r.period === opts.period)
      : candidates;
    const latest = filtered.sort(
      (a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt),
    )[0];

    if (!latest) {
      return {
        employeeId,
        generatedAt: this.clock().toISOString(),
        labels: { he: LABELS.he.pdi, en: LABELS.en.pdi },
        period: opts.period || null,
        reviewsConsidered: 0,
        strengths: [],
        weaknesses: [],
        goals: [],
        training: [],
      };
    }

    const template = this.templates.get(latest.templateId);
    const scale = template ? template.scale : 5;
    const meetsThreshold = scale * 0.7;
    const belowThreshold = scale * 0.6;

    const strengths = [];
    const weaknesses = [];
    const goals = [];
    const training = [];

    if (template) {
      for (const c of template.competencies) {
        const score = latest.scores ? latest.scores[c.id] : null;
        if (!isFiniteNumber(score)) continue;
        const item = {
          competencyId: c.id,
          label_he: c.label_he,
          label_en: c.label_en,
          score,
          weight: c.weight,
        };
        if (score >= meetsThreshold) {
          strengths.push(item);
        } else if (score < belowThreshold) {
          weaknesses.push(item);
          goals.push({
            competencyId: c.id,
            label_he: c.label_he,
            label_en: c.label_en,
            currentScore: score,
            targetScore: round(meetsThreshold, 1),
            timelineDays: 90,
          });
          training.push({
            competencyId: c.id,
            recommendation_he: `הכשרה ייעודית בנושא ${c.label_he}`,
            recommendation_en: `Targeted training on ${c.label_en}`,
            priority: score < scale * 0.4 ? 'high' : 'medium',
          });
        }
      }
    }

    return {
      employeeId,
      generatedAt: this.clock().toISOString(),
      labels: { he: LABELS.he.pdi, en: LABELS.en.pdi },
      period: latest.period,
      reviewsConsidered: filtered.length,
      basedOnReviewId: latest.id,
      overall: latest.overall,
      overallNormalized: latest.overallNormalized,
      strengths,
      weaknesses,
      goals,
      training,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 8. flagPerformanceIssue → triggers PIP per Israeli labor law
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {string} reviewId
   * @param {'minor'|'moderate'|'serious'|'critical'} severity
   * @param {string|object} action
   */
  flagPerformanceIssue(reviewId, severity, action) {
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`flagPerformanceIssue: reviewId "${reviewId}" not found`);
    const sev = PIP_SEVERITY[severity];
    if (!sev) {
      throw new Error(
        `flagPerformanceIssue: severity must be one of ${Object.keys(PIP_SEVERITY).join(', ')}`,
      );
    }

    const flag = {
      flaggedAt: this.clock().toISOString(),
      severity,
      severity_he: sev.he,
      severity_en: sev.en,
      action: typeof action === 'string' ? action : snap(action),
      pipRequired: sev.requiresPIP,
    };
    review.flags = review.flags || [];
    review.flags.push(flag);
    this._audit('flagPerformanceIssue', { reviewId, severity });

    if (!sev.requiresPIP) {
      return { flag: snap(flag), pip: null };
    }

    // Israeli labor-law gate: any moderate-or-worse flag triggers a PIP
    // with a written notice + mentor + KPIs + improvement window.
    const pip = this.triggerPIP(reviewId, {
      severity,
      durationDays: sev.pipDays,
      action: flag.action,
    });

    return { flag: snap(flag), pip };
  }

  // ─────────────────────────────────────────────────────────────
  // 8b. triggerPIP — explicit PIP creator (used by flagPerformanceIssue)
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {string} reviewId
   * @param {object} opts
   * @param {string} [opts.severity='moderate']
   * @param {number} [opts.durationDays=120]
   * @param {string} [opts.mentorId]
   * @param {Array<{kpi, target}>} [opts.kpis]
   * @param {string|object} [opts.action]
   */
  triggerPIP(reviewId, opts = {}) {
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`triggerPIP: reviewId "${reviewId}" not found`);

    const severity = opts.severity || 'moderate';
    const sev = PIP_SEVERITY[severity];
    if (!sev || !sev.requiresPIP) {
      throw new Error(`triggerPIP: severity "${severity}" does not require a PIP`);
    }

    let durationDays = isFiniteNumber(opts.durationDays) ? opts.durationDays : sev.pipDays;
    if (durationDays < MIN_PIP_DAYS) durationDays = MIN_PIP_DAYS;
    if (durationDays > MAX_PIP_DAYS) durationDays = MAX_PIP_DAYS;

    const startDate = this.clock();
    const endDate = new Date(startDate.getTime() + durationDays * 86400000);

    const pip = {
      id: this.randomId('pip'),
      reviewId,
      employeeId: review.employeeId,
      severity,
      severity_he: sev.he,
      severity_en: sev.en,
      // Israeli labor-law statutory checklist:
      writtenNoticeIssued: true,
      writtenNoticeDate: startDate.toISOString(),
      fairHearingScheduled: true,
      mentorId: opts.mentorId || review.managerId || null,
      kpis: Array.isArray(opts.kpis) ? snap(opts.kpis) : [],
      action: opts.action ? (typeof opts.action === 'string' ? opts.action : snap(opts.action)) : null,
      durationDays,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: 'open',
      milestones: [],
      outcome: null,
      createdAt: this.clock().toISOString(),
      // Embedded statutory references for auditors:
      statutoryReferences: [
        {
          he: 'חובת שימוע הוגן — פס"ד מילפלדר',
          en: 'Duty of fair hearing — Milfelder ruling',
        },
        {
          he: 'חובת תום-לב במשפט העבודה',
          en: 'Good-faith duty in Israeli labour law',
        },
      ],
    };

    this.pips.set(pip.id, pip);
    this.pipByReview.set(reviewId, pip.id);
    review.pipId = pip.id;
    this._audit('triggerPIP', { id: pip.id, reviewId, severity });
    return snap(pip);
  }

  // ─────────────────────────────────────────────────────────────
  // 8c. recordPIPMilestone / completePIP — append-only progression
  // ─────────────────────────────────────────────────────────────
  recordPIPMilestone(pipId, milestone) {
    const pip = this.pips.get(pipId);
    if (!pip) throw new Error(`recordPIPMilestone: pipId "${pipId}" not found`);
    if (pip.status !== 'open' && pip.status !== 'extended') {
      throw new Error(`recordPIPMilestone: PIP "${pipId}" is ${pip.status}`);
    }
    if (!milestone || typeof milestone !== 'object') {
      throw new Error('recordPIPMilestone: milestone object required');
    }
    const entry = {
      at: this.clock().toISOString(),
      title: milestone.title || '',
      progress: isFiniteNumber(milestone.progress) ? clamp(milestone.progress, 0, 1) : null,
      note: milestone.note || '',
      author: milestone.author || null,
    };
    pip.milestones.push(entry);
    return snap(entry);
  }

  /**
   * @param {string} pipId
   * @param {'completed'|'extended'|'terminated'} outcome
   * @param {object} [details]
   */
  completePIP(pipId, outcome, details = {}) {
    const pip = this.pips.get(pipId);
    if (!pip) throw new Error(`completePIP: pipId "${pipId}" not found`);
    if (!['completed', 'extended', 'terminated'].includes(outcome)) {
      throw new Error('completePIP: outcome must be completed | extended | terminated');
    }
    if (outcome === 'extended') {
      const extra = isFiniteNumber(details.extraDays) ? details.extraDays : 30;
      pip.endDate = new Date(new Date(pip.endDate).getTime() + extra * 86400000).toISOString();
      pip.status = 'extended';
      pip.extensions = pip.extensions || [];
      pip.extensions.push({
        at: this.clock().toISOString(),
        extraDays: extra,
        reason: details.reason || null,
      });
    } else {
      pip.status = outcome;
      pip.outcome = {
        at: this.clock().toISOString(),
        outcome,
        notes: details.notes || null,
      };
      // Termination outcome must have had a fair hearing.
      if (outcome === 'terminated') {
        pip.outcome.fairHearingHeld = details.fairHearingHeld === true;
        if (!pip.outcome.fairHearingHeld) {
          // Append a warning to the audit log — we still record the outcome.
          this._audit('pipTerminationWithoutHearing', { pipId });
        }
      }
    }
    this._audit('completePIP', { pipId, outcome });
    return snap(pip);
  }

  getPIP(pipId) {
    return snap(this.pips.get(pipId));
  }

  // ─────────────────────────────────────────────────────────────
  // 9. history — full multi-year, never purged
  // ─────────────────────────────────────────────────────────────
  history(employeeId) {
    if (!isNonEmptyString(employeeId)) {
      throw new Error('history: employeeId required');
    }
    const reviewIds = this.reviewsByEmployee.get(employeeId) || [];
    const reviews = reviewIds
      .map(id => this.reviews.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Group by year for an at-a-glance multi-year view.
    const byYear = {};
    for (const r of reviews) {
      const year = (r.period && r.period.match(/^\d{4}/) || [new Date(r.createdAt).getFullYear()])[0];
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push({
        id: r.id,
        period: r.period,
        templateId: r.templateId,
        status: r.status,
        overall: r.overall,
        overallNormalized: r.overallNormalized,
        bucket: r.calibration ? r.calibration.bucket : null,
        compGrade: r.compLink ? r.compLink.toGrade : null,
        pipId: r.pipId,
        flags: (r.flags || []).map(f => f.severity),
      });
    }

    // Compute trend (slope of overallNormalized over time).
    const seq = reviews
      .filter(r => isFiniteNumber(r.overallNormalized))
      .map(r => r.overallNormalized);
    let trend = null;
    if (seq.length >= 2) {
      const first = seq[0];
      const last = seq[seq.length - 1];
      trend = round(last - first, 4);
    }

    return {
      employeeId,
      total: reviews.length,
      byYear,
      trend,
      reviews: snap(reviews),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 10. generateReport — bilingual roll-up
  // ─────────────────────────────────────────────────────────────
  /**
   * @param {string} period
   * @param {object} [filter]
   * @param {string} [filter.departmentId]
   * @param {string} [filter.managerId]
   */
  generateReport(period, filter = {}) {
    if (!isNonEmptyString(period)) {
      throw new Error('generateReport: period required');
    }
    const matches = [];
    for (const r of this.reviews.values()) {
      if (r.period !== period) continue;
      if (filter.departmentId && r.departmentId !== filter.departmentId) continue;
      if (filter.managerId && r.managerId !== filter.managerId) continue;
      matches.push(r);
    }

    const total = matches.length;
    const submitted = matches.filter(
      r => r.status === STATUS.SUBMITTED || r.status === STATUS.CALIBRATED || r.status === STATUS.ARCHIVED,
    );
    const calibrated = matches.filter(
      r => r.status === STATUS.CALIBRATED || r.status === STATUS.ARCHIVED,
    );

    const sumOverall = submitted.reduce((s, r) => s + (r.overall || 0), 0);
    const avgOverall = submitted.length > 0 ? round(sumOverall / submitted.length, 3) : null;

    const bucketCounts = {};
    for (const r of matches) {
      const b = r.calibration ? r.calibration.bucket : 'unassigned';
      bucketCounts[b] = (bucketCounts[b] || 0) + 1;
    }

    const flagged = matches.filter(r => (r.flags || []).length > 0);
    const onPIP = matches.filter(r => r.pipId);

    return {
      period,
      filter: snap(filter),
      generatedAt: this.clock().toISOString(),
      labels: {
        he: {
          title: `${LABELS.he.report} — ${LABELS.he.review}`,
          period: LABELS.he.period,
          total: 'סה"כ',
          submitted: LABELS.he.status_submitted,
          calibrated: LABELS.he.status_calibrated,
          average: 'ממוצע',
          bell: LABELS.he.bell_curve,
          pip: LABELS.he.pip,
          flagged: 'דגלים',
        },
        en: {
          title: `${LABELS.en.report} — ${LABELS.en.review}`,
          period: LABELS.en.period,
          total: 'Total',
          submitted: LABELS.en.status_submitted,
          calibrated: LABELS.en.status_calibrated,
          average: 'Average',
          bell: LABELS.en.bell_curve,
          pip: LABELS.en.pip,
          flagged: 'Flagged',
        },
      },
      counts: {
        total,
        submitted: submitted.length,
        calibrated: calibrated.length,
        flagged: flagged.length,
        onPIP: onPIP.length,
      },
      averageOverall: avgOverall,
      distribution: bucketCounts,
      pipIds: onPIP.map(r => r.pipId).filter(Boolean),
      flaggedReviewIds: flagged.map(r => r.id),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // archive — soft-archive only (Kobi's law: never delete)
  // ─────────────────────────────────────────────────────────────
  archive(reviewId, reason) {
    const review = this.reviews.get(reviewId);
    if (!review) throw new Error(`archive: reviewId "${reviewId}" not found`);
    if (review.status === STATUS.DRAFT || review.status === STATUS.SCHEDULED) {
      throw new Error('archive: cannot archive an unsubmitted review');
    }
    this._setStatus(review, STATUS.ARCHIVED);
    review.archivedAt = this.clock().toISOString();
    review.archiveReason = reason ? String(reason) : null;
    this._audit('archive', { reviewId, reason });
    return snap(review);
  }

  // ─────────────────────────────────────────────────────────────
  // read helpers
  // ─────────────────────────────────────────────────────────────
  getReview(id) { return snap(this.reviews.get(id)); }

  listReviews(filter = {}) {
    const out = [];
    for (const r of this.reviews.values()) {
      if (filter.employeeId && r.employeeId !== filter.employeeId) continue;
      if (filter.period && r.period !== filter.period) continue;
      if (filter.status && r.status !== filter.status) continue;
      if (filter.includeArchived !== true && r.status === STATUS.ARCHIVED) continue;
      out.push(snap(r));
    }
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  PerformanceReview,
  STATUS,
  STATUS_ORDER,
  BELL_CURVE,
  PIP_SEVERITY,
  REVIEWER_KIND,
  K_ANON,
  MIN_PIP_DAYS,
  MAX_PIP_DAYS,
  LABELS,
  // low-level helpers exposed for tests
  _internals: {
    isNonEmptyString,
    isFiniteNumber,
    round,
    clamp,
    hashId,
    parseDate,
    snap,
  },
};
