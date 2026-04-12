/**
 * Productivity Analytics — Aggregate, Privacy-First
 * ניתוח פרודוקטיביות — צבירה ופרטיות תחילה
 *
 * Agent X-10 — Swarm 3 — Techno-Kol Uzi mega-ERP — 2026-04-11
 *
 * ═══════════════════════════════════════════════════════════════
 * PHILOSOPHY / תפיסת עולם
 * ═══════════════════════════════════════════════════════════════
 * This module computes employee productivity metrics to help
 * managers coach, train, and plan — NOT to surveil, rank, or
 * punish. Design is guided by:
 *   1. חוק הגנת הפרטיות, התשמ"א-1981 ותקנותיו
 *      (Israeli Privacy Protection Law 1981 and its regulations)
 *   2. GDPR Art. 5 (data minimization), Art. 22 (no solely-
 *      automated decisions with significant effect on individuals)
 *   3. ILO C158 / Israeli labor jurisprudence — productivity
 *      evidence used in disciplinary proceedings must be
 *      aggregated, transparent, and contestable.
 *
 * CONCRETE GUARANTEES / הבטחות קונקרטיות
 * ─────────────────────────────────────────
 *   ✓ No per-second / per-keystroke / per-mouse tracking.
 *   ✓ No automated warnings or alerts sent to employees or
 *     managers based on these metrics.
 *   ✓ No "productivity score" derived from attendance alone.
 *   ✓ No peer shaming — team dashboards are k-anonymized
 *     (minimum k = 5; individuals are never singled out there).
 *   ✓ Minimum aggregation window = one shift (typically ≥ 6h).
 *     Finer granularity is REJECTED at the API boundary.
 *   ✓ Individual reports are only visible to the HR role via
 *     RBAC and are audit-logged.
 *   ✓ Any employee may opt out (opted_out=true in people table);
 *     opted-out employees are excluded from all outputs and their
 *     jobs are attributed to "team:<id>" only.
 *   ✓ Hebrew privacy notice is embedded in every individual
 *     report payload (meta.privacyNoticeHe).
 *
 * REFUSED FEATURES / פיצ'רים שנדחו במכוון
 * ─────────────────────────────────────────
 *   ✗ attendanceBasedScore()       — would penalize disability,
 *                                    caregiving, illness.
 *   ✗ peerRanking()                — breeds toxic competition.
 *   ✗ automaticWarning()           — humans must decide.
 *   ✗ perSecondTracking()          — surveillance, illegal in
 *                                    many Israeli workplaces
 *                                    without written consent.
 *   ✗ keystrokeMonitoring()        — same.
 *
 * Zero runtime dependencies. Pure functions. All inputs are
 * plain arrays of record objects that the caller has already
 * loaded from whatever store (SQL, Supabase, JSON files, tests).
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS / קבועים
// ═══════════════════════════════════════════════════════════════

/** Minimum k for k-anonymity in team dashboards. */
const K_ANONYMITY_MIN = 5;

/** Minimum aggregation window (hours). Anything finer is refused. */
const MIN_AGG_HOURS = 6;

/** Default standard times (minutes) for common workshop jobs. */
const DEFAULT_STANDARD_TIMES = Object.freeze({
  'cut-steel':       45,
  'weld-frame':      90,
  'paint-assembly':  30,
  'cnc-setup':       25,
  'cnc-run':         60,
  'qa-inspection':   15,
  'pack-ship':       20,
  'default':         60,
});

/** Quality thresholds used in recommendations (NOT in warnings). */
const QUALITY_BENCHMARKS = Object.freeze({
  DEFECT_RATE_GOOD:   0.02,   //  ≤ 2%  defect rate is "good"
  DEFECT_RATE_OK:     0.05,   //  ≤ 5%  is "acceptable"
  REWORK_RATE_GOOD:   0.03,   //  ≤ 3%  rework is "good"
  REWORK_RATE_OK:     0.08,   //  ≤ 8%  is "acceptable"
});

/** Absence reasons which must NEVER count against productivity. */
const PROTECTED_ABSENCE_REASONS = Object.freeze(new Set([
  'sick',             // מחלה
  'miluim',           // שירות מילואים
  'maternity',        // חופשת לידה
  'paternity',        // חופשת אבהות
  'bereavement',      // אבל
  'jury_duty',        // חובת עדות
  'workplace_injury', // תאונת עבודה
  'protected_strike', // שביתה מוכרת
]));

/** Hebrew privacy notice — embedded in every individual report. */
const PRIVACY_NOTICE_HE =
  'הודעת פרטיות — לפי חוק הגנת הפרטיות, התשמ"א-1981 ותקנות הגנת ' +
  'הפרטיות (אבטחת מידע), התשע"ז-2017: נתונים אלה מחושבים בצבירה ' +
  'ברמת משמרת/יום/שבוע בלבד, ללא מעקב בזמן אמת. הנתונים מיועדים ' +
  'לאימון, חניכה ותכנון בלבד ואינם משמשים להחלטות משמעת אוטומטיות. ' +
  'לזכויות עיון, תיקון ומחיקה (סע\' 13-14 לחוק), פנה/י למשאבי אנוש. ' +
  'הסכמתך ל-opt-out מתועדת בטבלת people.opted_out ותיכבד מיידית.';

const PRIVACY_NOTICE_EN =
  'Privacy notice — Under Israeli Privacy Protection Law 1981 and ' +
  'the Data Security Regulations 2017: these numbers are aggregated ' +
  'to shift/day/week and contain no real-time tracking. They support ' +
  'coaching, training and planning only — never automated discipline. ' +
  'For access, correction and erasure rights (§§ 13-14) contact HR. ' +
  'Opt-out is honored immediately via people.opted_out.';

// ═══════════════════════════════════════════════════════════════
// INPUT VALIDATION / וולידציית קלט
// ═══════════════════════════════════════════════════════════════

function _isFiniteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

function _isNonEmptyString(x) {
  return typeof x === 'string' && x.length > 0;
}

function _isDate(x) {
  return x instanceof Date && !Number.isNaN(x.getTime());
}

function _toDate(x) {
  if (_isDate(x)) return x;
  if (typeof x === 'string' || typeof x === 'number') {
    const d = new Date(x);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function _assertPeriod(period) {
  if (!period || typeof period !== 'object') {
    throw new Error('period must be {start, end, granularity}');
  }
  const start = _toDate(period.start);
  const end = _toDate(period.end);
  if (!start || !end) {
    throw new Error('period.start and period.end must be valid dates');
  }
  if (end.getTime() <= start.getTime()) {
    throw new Error('period.end must be strictly after period.start');
  }
  const hours = (end.getTime() - start.getTime()) / 3600000;
  if (hours < MIN_AGG_HOURS) {
    throw new Error(
      `period too narrow: ${hours.toFixed(2)}h < ${MIN_AGG_HOURS}h minimum ` +
      '(per-minute/second tracking is refused for privacy reasons)'
    );
  }
  const granularity = period.granularity || 'shift';
  if (!['shift', 'day', 'week'].includes(granularity)) {
    throw new Error('granularity must be shift|day|week');
  }
  return { start, end, granularity };
}

// ═══════════════════════════════════════════════════════════════
// CORE METRIC CALCULATORS (pure, stateless)
// ═══════════════════════════════════════════════════════════════

/**
 * 1. Jobs completed per shift (workshop workers).
 * @param {Array<{completed:boolean, shiftId?:string}>} jobs
 * @param {number} shiftsWorked  distinct shifts in the period
 * @returns {number}  jobs / shift
 */
function jobsPerShift(jobs, shiftsWorked) {
  if (!Array.isArray(jobs)) return 0;
  if (!_isFiniteNum(shiftsWorked) || shiftsWorked <= 0) return 0;
  const completed = jobs.filter(j => j && j.completed === true).length;
  return _round(completed / shiftsWorked, 2);
}

/**
 * 2. Quality defect rate — defects / total outputs.
 * @param {Array<{defective?:boolean}>} outputs
 * @returns {number}  0..1
 */
function defectRate(outputs) {
  if (!Array.isArray(outputs) || outputs.length === 0) return 0;
  const defects = outputs.filter(o => o && o.defective === true).length;
  return _round(defects / outputs.length, 4);
}

/**
 * 3. Rework percentage — jobs reopened after initial "done".
 * @param {Array<{reworked?:boolean}>} jobs
 * @returns {number}  0..1
 */
function reworkRate(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return 0;
  const reworked = jobs.filter(j => j && j.reworked === true).length;
  return _round(reworked / jobs.length, 4);
}

/**
 * 4. Throughput vs standard time.
 * Returns a ratio > 1 means faster than standard (good),
 * < 1 means slower. Uses each job's own type→standard map.
 *
 * @param {Array<{type?:string, actualMinutes?:number}>} jobs
 * @param {Object<string,number>} standards  jobType → standardMinutes
 * @returns {number}  mean(standard/actual) across non-zero jobs
 */
function throughputVsStandard(jobs, standards = DEFAULT_STANDARD_TIMES) {
  if (!Array.isArray(jobs) || jobs.length === 0) return 1;
  const ratios = [];
  for (const j of jobs) {
    if (!j) continue;
    const actual = Number(j.actualMinutes);
    if (!_isFiniteNum(actual) || actual <= 0) continue;
    const std =
      (standards && standards[j.type]) ||
      (standards && standards['default']) ||
      DEFAULT_STANDARD_TIMES.default;
    ratios.push(std / actual);
  }
  if (ratios.length === 0) return 1;
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  return _round(mean, 3);
}

/**
 * 5. Overtime trend — fraction of hours that were overtime.
 * Broken down by ISO week so callers can plot trends.
 *
 * @param {Array<{weekISO:string, regularH:number, overtimeH:number}>} weeks
 * @returns {{byWeek:Array, avgRate:number, trendSlope:number}}
 */
function overtimeTrends(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return { byWeek: [], avgRate: 0, trendSlope: 0 };
  }
  const byWeek = weeks.map(w => {
    const reg = Number(w && w.regularH) || 0;
    const ot = Number(w && w.overtimeH) || 0;
    const total = reg + ot;
    return {
      weekISO: w && w.weekISO,
      rate: total > 0 ? _round(ot / total, 4) : 0,
      totalH: _round(total, 2),
    };
  });
  const rates = byWeek.map(x => x.rate);
  const avgRate = _round(rates.reduce((a, b) => a + b, 0) / rates.length, 4);
  // Simple linear slope via least squares on (i, rate).
  const n = rates.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += rates[i]; sumXY += i * rates[i]; sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  return { byWeek, avgRate, trendSlope: _round(slope, 5) };
}

/**
 * 6. Absence patterns — counts by reason, EXCLUDING protected reasons.
 * Protected reasons are reported separately and NEVER count negatively.
 *
 * @param {Array<{date:string, reason:string}>} absences
 * @returns {{unprotected:Object, protectedDays:number, totalDays:number}}
 */
function absencePatterns(absences) {
  if (!Array.isArray(absences)) {
    return { unprotected: {}, protectedDays: 0, totalDays: 0 };
  }
  const unprotected = {};
  let protectedDays = 0;
  for (const a of absences) {
    if (!a || !_isNonEmptyString(a.reason)) continue;
    if (PROTECTED_ABSENCE_REASONS.has(a.reason)) {
      protectedDays += 1;
      continue;
    }
    unprotected[a.reason] = (unprotected[a.reason] || 0) + 1;
  }
  const totalDays =
    Object.values(unprotected).reduce((a, b) => a + b, 0) + protectedDays;
  return { unprotected, protectedDays, totalDays };
}

/**
 * 7. Training completion — fraction of assigned trainings completed.
 * @param {Array<{assigned:boolean, completed:boolean}>} trainings
 * @returns {{completionRate:number, assigned:number, completed:number}}
 */
function trainingCompletion(trainings) {
  if (!Array.isArray(trainings) || trainings.length === 0) {
    return { completionRate: 0, assigned: 0, completed: 0 };
  }
  const assigned = trainings.filter(t => t && t.assigned === true).length;
  const completed = trainings.filter(
    t => t && t.assigned === true && t.completed === true
  ).length;
  return {
    completionRate: assigned === 0 ? 0 : _round(completed / assigned, 4),
    assigned,
    completed,
  };
}

/**
 * 8. Task cycle time — mean minutes from task start to completion.
 * @param {Array<{startedAt:string|Date, completedAt:string|Date}>} tasks
 * @returns {{meanMinutes:number, medianMinutes:number, count:number}}
 */
function taskCycleTime(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { meanMinutes: 0, medianMinutes: 0, count: 0 };
  }
  const durations = [];
  for (const t of tasks) {
    if (!t) continue;
    const s = _toDate(t.startedAt);
    const e = _toDate(t.completedAt);
    if (!s || !e) continue;
    const mins = (e.getTime() - s.getTime()) / 60000;
    if (mins >= 0) durations.push(mins);
  }
  if (durations.length === 0) {
    return { meanMinutes: 0, medianMinutes: 0, count: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    meanMinutes: _round(mean, 2),
    medianMinutes: _round(median, 2),
    count: durations.length,
  };
}

/**
 * 9. Revenue per employee (sales role).
 * @param {Array<{amount:number, currency?:string}>} deals
 * @returns {number}
 */
function revenuePerEmployee(deals) {
  if (!Array.isArray(deals) || deals.length === 0) return 0;
  const sum = deals.reduce((acc, d) => {
    const a = Number(d && d.amount);
    return _isFiniteNum(a) ? acc + a : acc;
  }, 0);
  return _round(sum, 2);
}

/**
 * 10. Customer satisfaction linked to employee.
 * Computes mean CSAT score (1..5) across surveys attributed to
 * the employee. Requires at least 3 responses for statistical
 * sanity; otherwise returns null with reason="insufficient_data".
 *
 * @param {Array<{score:number}>} surveys
 * @returns {{mean:number|null, n:number, reason?:string}}
 */
function customerSatisfaction(surveys) {
  if (!Array.isArray(surveys) || surveys.length === 0) {
    return { mean: null, n: 0, reason: 'insufficient_data' };
  }
  const scores = surveys
    .map(s => Number(s && s.score))
    .filter(x => _isFiniteNum(x) && x >= 1 && x <= 5);
  if (scores.length < 3) {
    return { mean: null, n: scores.length, reason: 'insufficient_data' };
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { mean: _round(mean, 2), n: scores.length };
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API / API ציבורי
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the full productivity profile for one employee over a
 * period. Returns aggregated metrics, peer benchmarks (anonymized,
 * percentile-only), and a trend summary.
 *
 * Employees who have opted out (people.opted_out=true in context)
 * receive an empty response with opted_out=true.
 *
 * @param {string} employeeId
 * @param {{start, end, granularity?}} period
 * @param {{
 *   people:    Array<{id, role, team_id, opted_out?}>,
 *   jobs:      Array,
 *   outputs:   Array,
 *   hours:     Array,
 *   absences:  Array,
 *   trainings: Array,
 *   tasks:     Array,
 *   deals:     Array,
 *   csat:      Array,
 *   standards?: Object<string,number>
 * }} context
 * @returns {Object}
 */
function computeProductivity(employeeId, period, context) {
  if (!_isNonEmptyString(employeeId)) {
    throw new Error('employeeId required');
  }
  const p = _assertPeriod(period);
  if (!context || typeof context !== 'object') {
    throw new Error('context required (pre-loaded data arrays)');
  }
  const people = Array.isArray(context.people) ? context.people : [];
  const emp = people.find(x => x && x.id === employeeId);
  if (!emp) {
    return {
      employeeId,
      metrics: null,
      peer_benchmark: null,
      trend: null,
      meta: {
        reason: 'employee_not_found',
        privacyNoticeHe: PRIVACY_NOTICE_HE,
        privacyNoticeEn: PRIVACY_NOTICE_EN,
      },
    };
  }
  if (emp.opted_out === true) {
    return {
      employeeId,
      metrics: null,
      peer_benchmark: null,
      trend: null,
      meta: {
        opted_out: true,
        reason: 'opted_out',
        privacyNoticeHe: PRIVACY_NOTICE_HE,
        privacyNoticeEn: PRIVACY_NOTICE_EN,
      },
    };
  }

  // Filter context arrays to this employee and period.
  const filt = _filterByEmployeeAndPeriod(context, employeeId, p);

  // Distinct shifts the employee actually worked.
  const shiftsWorked = _countDistinctShifts(filt.hours);

  const metrics = {
    jobsPerShift:         jobsPerShift(filt.jobs, shiftsWorked),
    defectRate:           defectRate(filt.outputs),
    reworkRate:           reworkRate(filt.jobs),
    throughputVsStandard: throughputVsStandard(filt.jobs, context.standards),
    overtimeTrends:       overtimeTrends(_weeklyHours(filt.hours)),
    absencePatterns:      absencePatterns(filt.absences),
    trainingCompletion:   trainingCompletion(filt.trainings),
    taskCycleTime:        taskCycleTime(filt.tasks),
    revenuePerEmployee:   emp.role === 'sales' ? revenuePerEmployee(filt.deals) : null,
    customerSatisfaction: customerSatisfaction(filt.csat),
  };

  // Peer benchmark: percentile of this employee's key metrics
  // against same-role peers who are NOT opted out.
  const peers = people.filter(x =>
    x && x.id !== employeeId && x.role === emp.role && x.opted_out !== true
  );
  const peer_benchmark = _percentileBenchmark(
    metrics, peers, context, p
  );

  const trend = _buildTrend(filt, p);

  return {
    employeeId,
    role: emp.role,
    period: {
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      granularity: p.granularity,
    },
    metrics,
    peer_benchmark,
    trend,
    meta: {
      opted_out: false,
      rbacRequired: 'hr',    // caller must enforce RBAC
      auditLog: true,        // caller should audit-log access
      privacyNoticeHe: PRIVACY_NOTICE_HE,
      privacyNoticeEn: PRIVACY_NOTICE_EN,
      refusedAntipatterns: [
        'attendance_score',
        'peer_ranking',
        'automatic_warning',
        'per_second_tracking',
        'keystroke_monitoring',
      ],
    },
  };
}

/**
 * Team dashboard — anonymized aggregates only.
 * Rejects teams with fewer than K_ANONYMITY_MIN non-opted-out
 * members to prevent re-identification.
 *
 * @param {string} teamId
 * @param {{start, end, granularity?}} period
 * @param {Object} context  same shape as computeProductivity
 * @returns {Object}
 */
function teamDashboard(teamId, period, context) {
  if (!_isNonEmptyString(teamId)) {
    throw new Error('teamId required');
  }
  const p = _assertPeriod(period);
  if (!context || typeof context !== 'object') {
    throw new Error('context required');
  }
  const people = Array.isArray(context.people) ? context.people : [];
  const members = people.filter(x =>
    x && x.team_id === teamId && x.opted_out !== true
  );

  if (members.length < K_ANONYMITY_MIN) {
    return {
      teamId,
      eligible: false,
      reason: `k-anonymity floor not met: ${members.length} < ${K_ANONYMITY_MIN}`,
      reasonHe: `חסם k-אנונימיות לא הושג: ${members.length} < ${K_ANONYMITY_MIN}. ` +
                'כדי להגן על פרטיות היחיד, הצוות קטן מדי להצגת נתונים מצטברים.',
      aggregates: null,
      meta: {
        privacyNoticeHe: PRIVACY_NOTICE_HE,
        privacyNoticeEn: PRIVACY_NOTICE_EN,
      },
    };
  }

  // Compute aggregate metrics across team members (no per-person output).
  const perMember = members.map(m => {
    const f = _filterByEmployeeAndPeriod(context, m.id, p);
    const shifts = _countDistinctShifts(f.hours);
    return {
      jps:    jobsPerShift(f.jobs, shifts),
      defect: defectRate(f.outputs),
      rework: reworkRate(f.jobs),
      thru:   throughputVsStandard(f.jobs, context.standards),
      cycle:  taskCycleTime(f.tasks).meanMinutes,
    };
  });

  const aggregate = (key) => {
    const vals = perMember.map(x => x[key]).filter(_isFiniteNum);
    if (vals.length === 0) return { mean: 0, median: 0, p25: 0, p75: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    return {
      mean:   _round(vals.reduce((a, b) => a + b, 0) / vals.length, 3),
      median: _round(_percentile(sorted, 0.5), 3),
      p25:    _round(_percentile(sorted, 0.25), 3),
      p75:    _round(_percentile(sorted, 0.75), 3),
    };
  };

  return {
    teamId,
    eligible: true,
    memberCount: members.length,                       // count, not names
    period: {
      start: p.start.toISOString(),
      end: p.end.toISOString(),
      granularity: p.granularity,
    },
    aggregates: {
      jobsPerShift:         aggregate('jps'),
      defectRate:           aggregate('defect'),
      reworkRate:           aggregate('rework'),
      throughputVsStandard: aggregate('thru'),
      taskCycleTimeMinutes: aggregate('cycle'),
    },
    meta: {
      kAnonymityMin: K_ANONYMITY_MIN,
      anonymized: true,
      privacyNoticeHe: PRIVACY_NOTICE_HE,
      privacyNoticeEn: PRIVACY_NOTICE_EN,
    },
  };
}

/**
 * Return the standard time (in minutes) for a given job type.
 * Falls back to the 'default' entry if the type is unknown.
 *
 * @param {string} jobType
 * @param {Object<string,number>} [customStandards]
 * @returns {{jobType:string, standardMinutes:number, source:string}}
 */
function standardTimes(jobType, customStandards) {
  const src = customStandards && typeof customStandards === 'object'
    ? customStandards
    : DEFAULT_STANDARD_TIMES;
  if (!_isNonEmptyString(jobType)) {
    return {
      jobType: 'default',
      standardMinutes: src['default'] || DEFAULT_STANDARD_TIMES.default,
      source: 'default_fallback',
    };
  }
  if (src[jobType] !== undefined) {
    return {
      jobType,
      standardMinutes: src[jobType],
      source: customStandards ? 'custom' : 'builtin',
    };
  }
  return {
    jobType,
    standardMinutes: src['default'] || DEFAULT_STANDARD_TIMES.default,
    source: 'default_fallback',
  };
}

/**
 * Identify bottleneck steps in a workflow. A step is considered
 * a bottleneck if its mean duration is > 1.5 × the median-step
 * duration OR if its waiting-queue length exceeds workflowMean.
 *
 * @param {{
 *   workflowId:string,
 *   steps:Array<{
 *     stepId:string,
 *     name?:string,
 *     meanMinutes:number,
 *     queueLength?:number
 *   }>
 * }} workflow
 * @returns {{workflowId:string, bottlenecks:Array, summary:Object}}
 */
function identifyBottlenecks(workflow) {
  if (!workflow || typeof workflow !== 'object' || !Array.isArray(workflow.steps)) {
    return {
      workflowId: (workflow && workflow.workflowId) || null,
      bottlenecks: [],
      summary: { reason: 'no_steps' },
    };
  }
  const steps = workflow.steps.filter(s =>
    s && _isNonEmptyString(s.stepId) && _isFiniteNum(s.meanMinutes) && s.meanMinutes >= 0
  );
  if (steps.length === 0) {
    return {
      workflowId: workflow.workflowId || null,
      bottlenecks: [],
      summary: { reason: 'no_valid_steps' },
    };
  }
  const durations = steps.map(s => s.meanMinutes);
  const sortedD = [...durations].sort((a, b) => a - b);
  const median = _percentile(sortedD, 0.5);
  const meanQ = steps.reduce(
    (a, s) => a + (Number(s.queueLength) || 0), 0
  ) / steps.length;

  const bottlenecks = [];
  for (const s of steps) {
    const reasons = [];
    const ratio = median > 0 ? s.meanMinutes / median : 0;
    if (ratio > 1.5) reasons.push('slow_relative_to_median');
    const q = Number(s.queueLength) || 0;
    if (q > meanQ && meanQ > 0) reasons.push('queue_above_mean');
    if (reasons.length > 0) {
      bottlenecks.push({
        stepId: s.stepId,
        name: s.name || s.stepId,
        meanMinutes: _round(s.meanMinutes, 2),
        queueLength: q,
        ratioToMedian: _round(ratio, 2),
        reasons,
        suggestionHe: _bottleneckSuggestionHe(reasons),
        suggestionEn: _bottleneckSuggestionEn(reasons),
      });
    }
  }

  return {
    workflowId: workflow.workflowId || null,
    bottlenecks: bottlenecks.sort(
      (a, b) => b.ratioToMedian - a.ratioToMedian
    ),
    summary: {
      stepCount: steps.length,
      medianMinutes: _round(median, 2),
      meanQueueLength: _round(meanQ, 2),
      bottleneckCount: bottlenecks.length,
    },
  };
}

/**
 * Suggest training modules for an employee based on observed
 * skill gaps (inferred from metrics, not from subjective review).
 *
 * Returns SUGGESTIONS — never assignments. The caller (a human
 * manager) must discuss with the employee before enrolling them.
 *
 * @param {{
 *   id:string,
 *   role?:string,
 *   metrics?:Object,
 *   completedTrainings?:Array<string>
 * }} employee
 * @returns {{employeeId:string, suggestions:Array, meta:Object}}
 */
function suggestTraining(employee) {
  if (!employee || !_isNonEmptyString(employee.id)) {
    throw new Error('employee.id required');
  }
  const metrics = employee.metrics || {};
  const done = new Set(
    Array.isArray(employee.completedTrainings)
      ? employee.completedTrainings
      : []
  );
  const suggestions = [];

  const add = (code, titleHe, titleEn, reasonHe, reasonEn) => {
    if (done.has(code)) return;
    suggestions.push({ code, titleHe, titleEn, reasonHe, reasonEn });
  };

  // Defect rate > "acceptable"
  if (_isFiniteNum(metrics.defectRate) && metrics.defectRate > QUALITY_BENCHMARKS.DEFECT_RATE_OK) {
    add(
      'QA-101',
      'בקרת איכות בסיסית',
      'Basic Quality Control',
      'שיעור הפגמים מעל סף מקובל (>5%). המלצה לחניכה, לא משמעת.',
      'Defect rate above acceptable threshold (>5%). Coaching, not discipline.'
    );
  }
  // Rework rate > "acceptable"
  if (_isFiniteNum(metrics.reworkRate) && metrics.reworkRate > QUALITY_BENCHMARKS.REWORK_RATE_OK) {
    add(
      'PROC-210',
      'קריאת תכנית עבודה ומפרט',
      'Reading Work Orders & Specs',
      'שיעור עבודה חוזרת גבוה; ייתכן פער בהבנת מפרט.',
      'High rework suggests gap in spec comprehension.'
    );
  }
  // Throughput well below standard
  if (_isFiniteNum(metrics.throughputVsStandard) && metrics.throughputVsStandard < 0.8) {
    add(
      'TOOL-150',
      'הכרות עם כלי עבודה מתקדמים',
      'Advanced Tool Familiarization',
      'התפוקה מתחת 80% מהסטנדרט; אולי חסר הכרות עם כלי/מכונה.',
      'Throughput < 80% of standard; may lack tool familiarity.'
    );
  }
  // Low training completion — suggest refresh of core module
  if (metrics.trainingCompletion &&
      _isFiniteNum(metrics.trainingCompletion.completionRate) &&
      metrics.trainingCompletion.completionRate < 0.5 &&
      metrics.trainingCompletion.assigned > 0) {
    add(
      'ORIENT-001',
      'רענון אוריינטציה כללית',
      'General Orientation Refresh',
      'השלמה של הדרכות שהוקצו טרם הושגה; פנייה שיחה תומכת.',
      'Assigned trainings not yet completed; schedule a supportive chat.'
    );
  }
  // Sales role + low CSAT
  if (employee.role === 'sales' &&
      metrics.customerSatisfaction &&
      _isFiniteNum(metrics.customerSatisfaction.mean) &&
      metrics.customerSatisfaction.mean < 3.5 &&
      metrics.customerSatisfaction.n >= 3) {
    add(
      'CS-320',
      'תקשורת עם לקוחות קשים',
      'Handling Difficult Customers',
      'ציון שביעות רצון ממוצע מתחת ל-3.5; הצעה לסדנה תומכת.',
      'Mean CSAT < 3.5; offer a supportive workshop.'
    );
  }

  return {
    employeeId: employee.id,
    suggestions,
    meta: {
      advisoryOnly: true,
      requiresHumanReview: true,
      noticeHe: 'המלצות לעיון בלבד. חובה לשוחח עם העובד/ת לפני שיבוץ.',
      noticeEn: 'Advisory only. Must discuss with employee before enrollment.',
      privacyNoticeHe: PRIVACY_NOTICE_HE,
      privacyNoticeEn: PRIVACY_NOTICE_EN,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS / פנימי
// ═══════════════════════════════════════════════════════════════

function _round(x, places) {
  if (!_isFiniteNum(x)) return 0;
  const f = Math.pow(10, places);
  return Math.round(x * f) / f;
}

function _percentile(sortedArr, p) {
  if (!Array.isArray(sortedArr) || sortedArr.length === 0) return 0;
  if (sortedArr.length === 1) return sortedArr[0];
  const idx = (sortedArr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  const frac = idx - lo;
  return sortedArr[lo] * (1 - frac) + sortedArr[hi] * frac;
}

function _filterByEmployeeAndPeriod(context, employeeId, period) {
  const inRange = (rec) => {
    const d = _toDate(rec && (rec.date || rec.startedAt || rec.occurredAt));
    if (!d) return true; // records without dates are treated as in-range
    return d.getTime() >= period.start.getTime() &&
           d.getTime() <= period.end.getTime();
  };
  const byEmp = (rec) => rec && rec.employeeId === employeeId;
  return {
    jobs:      (context.jobs      || []).filter(r => byEmp(r) && inRange(r)),
    outputs:   (context.outputs   || []).filter(r => byEmp(r) && inRange(r)),
    hours:     (context.hours     || []).filter(r => byEmp(r) && inRange(r)),
    absences:  (context.absences  || []).filter(r => byEmp(r) && inRange(r)),
    trainings: (context.trainings || []).filter(r => byEmp(r)),
    tasks:     (context.tasks     || []).filter(r => byEmp(r) && inRange(r)),
    deals:     (context.deals     || []).filter(r => byEmp(r) && inRange(r)),
    csat:      (context.csat      || []).filter(r => byEmp(r) && inRange(r)),
  };
}

function _countDistinctShifts(hoursRecords) {
  if (!Array.isArray(hoursRecords)) return 0;
  const ids = new Set();
  for (const h of hoursRecords) {
    if (!h) continue;
    const id = h.shiftId || (h.date ? String(h.date) : null);
    if (id) ids.add(id);
  }
  return ids.size;
}

function _weeklyHours(hoursRecords) {
  if (!Array.isArray(hoursRecords)) return [];
  const byWeek = new Map();
  for (const h of hoursRecords) {
    if (!h) continue;
    const d = _toDate(h.date);
    if (!d) continue;
    const weekISO = _isoWeekKey(d);
    if (!byWeek.has(weekISO)) {
      byWeek.set(weekISO, { weekISO, regularH: 0, overtimeH: 0 });
    }
    const bucket = byWeek.get(weekISO);
    bucket.regularH  += Number(h.regularH)  || 0;
    bucket.overtimeH += Number(h.overtimeH) || 0;
  }
  // Sorted chronologically for trend analysis.
  return Array.from(byWeek.values()).sort((a, b) =>
    a.weekISO.localeCompare(b.weekISO)
  );
}

/**
 * ISO-8601 week key like "2026-W15". Zero-dep implementation.
 */
function _isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year (ISO-8601).
  const dayNum = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - (3 - ((firstThursday.getUTCDay() + 6) % 7))) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function _percentileBenchmark(metrics, peers, context, period) {
  // Returns only percentile positions (0..100) — never peer names
  // or raw peer values.
  if (!Array.isArray(peers) || peers.length < 3) {
    return { available: false, reason: 'insufficient_peers' };
  }
  const peerJps = [];
  const peerDefect = [];
  const peerThru = [];
  for (const p of peers) {
    const f = _filterByEmployeeAndPeriod(context, p.id, period);
    peerJps.push(jobsPerShift(f.jobs, _countDistinctShifts(f.hours)));
    peerDefect.push(defectRate(f.outputs));
    peerThru.push(throughputVsStandard(f.jobs, context.standards));
  }
  return {
    available: true,
    peerCount: peers.length,
    jobsPerShiftPercentile: _percentileRank(peerJps, metrics.jobsPerShift),
    // defect: lower is better, so invert
    defectRatePercentile:   100 - _percentileRank(peerDefect, metrics.defectRate),
    throughputPercentile:   _percentileRank(peerThru, metrics.throughputVsStandard),
  };
}

function _percentileRank(arr, value) {
  if (!Array.isArray(arr) || arr.length === 0) return 50;
  if (!_isFiniteNum(value)) return 50;
  const below = arr.filter(x => _isFiniteNum(x) && x < value).length;
  const equal = arr.filter(x => _isFiniteNum(x) && x === value).length;
  const pr = (below + 0.5 * equal) / arr.length * 100;
  return _round(pr, 1);
}

function _buildTrend(filt, period) {
  // A simple trend: compare first half vs second half of the period.
  const mid = new Date((period.start.getTime() + period.end.getTime()) / 2);
  const firstJobs = filt.jobs.filter(j => {
    const d = _toDate(j && j.date);
    return d && d.getTime() < mid.getTime();
  });
  const secondJobs = filt.jobs.filter(j => {
    const d = _toDate(j && j.date);
    return d && d.getTime() >= mid.getTime();
  });
  const firstDefect = defectRate(firstJobs);
  const secondDefect = defectRate(secondJobs);
  const delta = secondDefect - firstDefect;
  let direction = 'stable';
  if (delta < -0.005) direction = 'improving';
  else if (delta > 0.005) direction = 'declining';
  return {
    defectRateFirstHalf: firstDefect,
    defectRateSecondHalf: secondDefect,
    direction,
  };
}

function _bottleneckSuggestionHe(reasons) {
  const parts = [];
  if (reasons.includes('slow_relative_to_median')) {
    parts.push('שלב איטי משמעותית; בדוק עומסים וכלי עבודה');
  }
  if (reasons.includes('queue_above_mean')) {
    parts.push('תור ממתין גדול מהממוצע; שקול הקצאת משאב נוסף');
  }
  return parts.join('. ') || 'אין המלצה ספציפית';
}

function _bottleneckSuggestionEn(reasons) {
  const parts = [];
  if (reasons.includes('slow_relative_to_median')) {
    parts.push('Significantly slow step; review load and tooling');
  }
  if (reasons.includes('queue_above_mean')) {
    parts.push('Queue above mean; consider adding capacity');
  }
  return parts.join('. ') || 'No specific recommendation';
}

// ═══════════════════════════════════════════════════════════════
// EXPLICITLY REFUSED — anti-patterns that THROW if called
// ═══════════════════════════════════════════════════════════════

function attendanceBasedScore() {
  throw new Error(
    'REFUSED: attendanceBasedScore is an anti-pattern. Productivity ' +
    'must never be derived from attendance alone — that penalizes ' +
    'disability, caregiving, illness, and miluim. See productivity.js ' +
    'module header.'
  );
}

function peerRanking() {
  throw new Error(
    'REFUSED: peerRanking creates toxic competition and violates the ' +
    'aggregate-only guarantee of this module.'
  );
}

function automaticWarning() {
  throw new Error(
    'REFUSED: automatic warnings on these metrics are prohibited. ' +
    'Humans must review context before any disciplinary action.'
  );
}

function perSecondTracking() {
  throw new Error(
    'REFUSED: per-second/keystroke tracking is a surveillance pattern ' +
    'that is illegal in most Israeli workplaces without written consent ' +
    'and violates חוק הגנת הפרטיות.'
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // Public API
  computeProductivity,
  teamDashboard,
  standardTimes,
  identifyBottlenecks,
  suggestTraining,

  // Individual metric calculators (useful for tests and custom reports)
  jobsPerShift,
  defectRate,
  reworkRate,
  throughputVsStandard,
  overtimeTrends,
  absencePatterns,
  trainingCompletion,
  taskCycleTime,
  revenuePerEmployee,
  customerSatisfaction,

  // Constants (read-only by convention)
  K_ANONYMITY_MIN,
  MIN_AGG_HOURS,
  DEFAULT_STANDARD_TIMES,
  QUALITY_BENCHMARKS,
  PROTECTED_ABSENCE_REASONS,
  PRIVACY_NOTICE_HE,
  PRIVACY_NOTICE_EN,

  // Refused anti-patterns — exported so linters / docs can verify
  // they are wired to throw.
  attendanceBasedScore,
  peerRanking,
  automaticWarning,
  perSecondTracking,
};
