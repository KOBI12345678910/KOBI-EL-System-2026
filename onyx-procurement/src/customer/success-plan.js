/**
 * Customer Success Plan Builder  |  בונה תכנית הצלחת לקוח
 * =============================================================
 *
 * Agent Y-103  |  Swarm 4  |  Techno-Kol Uzi mega-ERP
 *
 * A zero-dependency, in-memory Customer Success Plan (CSP) engine.
 * Drives the joint vision, goals, stakeholders, risks, milestones,
 * health, QBRs, ROI, escalations, executive decks, cadence, value
 * realization and renewal readiness of every enterprise account.
 *
 * No external libraries — only Node built-ins. Deterministic ids.
 * Hebrew + English bilingual labels on every field, status and signal.
 *
 * -------------------------------------------------------------
 * CORE RULE
 * -------------------------------------------------------------
 *   לא מוחקים רק משדרגים ומגדלים  —  never delete, only upgrade and grow.
 *
 *   - Plans are NEVER removed. When a customer churns, the plan flips
 *     to `archived` (still queryable, still part of the audit trail).
 *   - Goals, milestones, risks, stakeholders and decisions are append-
 *     only: changes become new versions, old snapshots are preserved.
 *   - `updatePlanWithCustomer(...)` keeps `plan.history[]` so every
 *     review is traceable, replayable, and stamped with the reviewer.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Plan {
 *     id, customer_id, csm, start_date, end_date, vision{he,en},
 *     goals[], stakeholders[], risks[], milestones[],
 *     cadence, status, health_score, renewal_score,
 *     created_at, updated_at, archived_at?,
 *     history[], decisions[], roi_snapshots[], escalations[],
 *     value_log[], qbrs[], touchpoints[]
 *   }
 *
 *   Goal {
 *     id, description_he, description_en, metric, target,
 *     owner, due_date, status, actuals[], created_at, updated_at
 *   }
 *
 *   Stakeholder { id, name, role, influence, sentiment, email, type }
 *   Risk        { id, description_he, description_en, severity, mitigation, status }
 *   Milestone   { id, name_he, name_en, target_date, achieved_date?, status }
 *
 * -------------------------------------------------------------
 * PUBLIC API (SuccessPlan class)
 * -------------------------------------------------------------
 *   createPlan({...})                       → plan
 *   trackGoalProgress({...})                → goal
 *   planHealth(planId)                      → { score, breakdown, label }
 *   quarterlyReview({planId, quarter})      → QBR object
 *   stakeholderMap(planId)                  → exec_sponsor / champion / users / blockers
 *   roiCalculation({planId, investments, returns}) → ROI object
 *   escalation({planId, issue, severity, routedTo}) → esc object
 *   updatePlanWithCustomer({...})           → plan (with new history entry)
 *   generateExecutivePDF(planId)            → { bytes, pdf_base64, pages }
 *   cadenceTracker({planId, cadence})       → { next_touchpoints[], overdue[] }
 *   valueRealization(planId)                → { planned, delivered, gap, pct }
 *   renewalReadiness(planId)                → { score, factors[], label }
 *
 * -------------------------------------------------------------
 * EXTENSION API (Y-103 upgrade — append-only, never breaks core)
 * -------------------------------------------------------------
 *   updateMilestone({planId, goalId, currentValue, notes, updatedBy})
 *                                          → goal + history entry
 *   computeProgress(planId)                 → weighted 0-100% across goals
 *   riskAssessment(planId)                  → { band: green|yellow|red, ... }
 *   addMilestone(planId, goal)              → goal (appended, no removal)
 *   markAtRisk(planId, reason)              → flag + recipients + history
 *   escalate(planId, level)                 → to csm_manager|vp_cs|executive
 *   scheduleReview(planId, date, attendees) → review meeting record
 *   generateDeck(planId, lang)              → bilingual HTML deck
 *   aggregatePortfolio(csmId)               → all plans owned by CSM + totals
 *   graduatePlan(planId)                    → status=graduated, record preserved
 *   closeUnsuccessful(planId, reason)       → status=closed_unsuccessful, preserved
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Bilingual label dictionary
// ─────────────────────────────────────────────────────────────

const GOAL_STATUS = {
  not_started: { he: 'טרם החל', en: 'Not started', weight: 0.00 },
  on_track:    { he: 'במסלול',  en: 'On track',    weight: 1.00 },
  at_risk:     { he: 'בסיכון',  en: 'At risk',     weight: 0.50 },
  off_track:   { he: 'סטייה',   en: 'Off track',   weight: 0.20 },
  achieved:    { he: 'הושג',    en: 'Achieved',    weight: 1.00 },
  missed:      { he: 'לא הושג', en: 'Missed',      weight: 0.00 },
};

const PLAN_STATUS = {
  draft:                { he: 'טיוטה',            en: 'Draft' },
  active:               { he: 'פעיל',             en: 'Active' },
  at_risk:              { he: 'בסיכון',           en: 'At risk' },
  healthy:              { he: 'בריא',             en: 'Healthy' },
  critical:             { he: 'קריטי',            en: 'Critical' },
  archived:             { he: 'ארכיון',           en: 'Archived' },
  graduated:            { he: 'הושלמה בהצלחה',    en: 'Graduated' },
  closed_unsuccessful:  { he: 'נסגרה ללא הצלחה',  en: 'Closed unsuccessful' },
};

// Risk bands used by riskAssessment — distinct from HEALTH_LABELS so both
// can evolve independently without breaking the existing health API.
const RISK_BANDS = {
  green:  { he: 'ירוק — במסלול',        en: 'Green — on track',    min: 0.80 },
  yellow: { he: 'צהוב — דורש מעקב',      en: 'Yellow — watch',      min: 0.50 },
  red:    { he: 'אדום — התערבות דחופה',  en: 'Red — intervene now', min: 0.00 },
};

// Escalation ladder for the extension escalate() method.
// Levels are ordered: each level includes everyone below.
const ESCALATION_LEVELS = {
  csm_manager: {
    order: 1,
    he: 'מנהל/ת CSM',
    en: 'CSM manager',
    recipients: ['csm_manager'],
  },
  vp_cs: {
    order: 2,
    he: 'סגן/נית נשיא/ה להצלחת לקוחות',
    en: 'VP Customer Success',
    recipients: ['csm_manager', 'vp_cs'],
  },
  executive: {
    order: 3,
    he: 'הנהלה בכירה',
    en: 'Executive',
    recipients: ['csm_manager', 'vp_cs', 'cro', 'ceo'],
  },
};

const HEALTH_LABELS = {
  green:  { he: 'ירוק',  en: 'Green',  min: 0.75 },
  yellow: { he: 'צהוב',  en: 'Yellow', min: 0.50 },
  red:    { he: 'אדום',  en: 'Red',    min: 0.00 },
};

const SEVERITY = {
  low:      { he: 'נמוכה',  en: 'Low',      order: 1, sla_hours: 72 },
  medium:   { he: 'בינונית', en: 'Medium',   order: 2, sla_hours: 24 },
  high:     { he: 'גבוהה',  en: 'High',     order: 3, sla_hours: 8  },
  critical: { he: 'קריטית', en: 'Critical', order: 4, sla_hours: 2  },
};

const CADENCE = {
  weekly:    { he: 'שבועי',   en: 'Weekly',    days: 7   },
  biweekly:  { he: 'דו-שבועי', en: 'Biweekly',  days: 14  },
  monthly:   { he: 'חודשי',   en: 'Monthly',   days: 30  },
  quarterly: { he: 'רבעוני',  en: 'Quarterly', days: 90  },
  annually:  { he: 'שנתי',    en: 'Annually',  days: 365 },
};

// Review cadence for createPlan({reviewCadence}) — a subset of CADENCE
// filtered to the four cadences the Y-103 spec explicitly allows.
const REVIEW_CADENCES = {
  weekly:    CADENCE.weekly,
  biweekly:  CADENCE.biweekly,
  monthly:   CADENCE.monthly,
  quarterly: CADENCE.quarterly,
};

const STAKEHOLDER_TYPES = {
  exec_sponsor: { he: 'נותן חסות ביצועי', en: 'Executive sponsor' },
  champion:     { he: 'אלוף',              en: 'Champion' },
  user:         { he: 'משתמש',             en: 'End user' },
  influencer:   { he: 'משפיע',             en: 'Influencer' },
  blocker:      { he: 'חוסם',              en: 'Blocker' },
  decision:     { he: 'מקבל החלטות',       en: 'Decision maker' },
};

const RENEWAL_LABELS = {
  likely:   { he: 'צפוי לחדש',   en: 'Likely to renew' },
  stable:   { he: 'יציב',        en: 'Stable' },
  at_risk:  { he: 'בסיכון',      en: 'At risk' },
  critical: { he: 'לא צפוי לחדש', en: 'Unlikely to renew' },
};

// ─────────────────────────────────────────────────────────────
// Deterministic id generator  (no crypto import, no Date.now reliance
// inside unit tests — callers may inject `now` for determinism)
// ─────────────────────────────────────────────────────────────

function makeIdFactory(prefix) {
  let counter = 0;
  return function () {
    counter += 1;
    return `${prefix}_${counter.toString(36).padStart(4, '0')}`;
  };
}

function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = clone(v[k]);
  return out;
}

function toISO(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'number') return new Date(d).toISOString();
  return String(d);
}

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  return new Date(d);
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return 0;
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
}

function pct(num, den) {
  if (!den || den === 0) return 0;
  return Math.max(0, Math.min(1, num / den));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// SuccessPlan class
// ─────────────────────────────────────────────────────────────

class SuccessPlan {
  constructor(opts = {}) {
    this._plans = new Map();
    this._nextPlanId = makeIdFactory('plan');
    this._nextGoalId = makeIdFactory('goal');
    this._nextStakeholderId = makeIdFactory('sh');
    this._nextRiskId = makeIdFactory('risk');
    this._nextMilestoneId = makeIdFactory('mile');
    this._nextEscId = makeIdFactory('esc');
    this._nextRoiId = makeIdFactory('roi');
    this._nextQbrId = makeIdFactory('qbr');
    this._nextTouchId = makeIdFactory('tp');
    this._nextHistoryId = makeIdFactory('hist');
    this._now = opts.now || (() => new Date().toISOString());
  }

  // ───────────────────────────────────────────────────────────
  // createPlan
  // ───────────────────────────────────────────────────────────
  createPlan({
    customerId,
    csm,
    startDate,
    endDate,
    vision,
    goals = [],
    stakeholders = [],
    risks = [],
    milestones = [],
    cadence = 'monthly',
    reviewCadence,  // Y-103 alias — weekly|biweekly|monthly|quarterly
  } = {}) {
    // Y-103: `reviewCadence` is the public-facing name. Accept both without
    // breaking existing behavior — `cadence` still wins if both are supplied.
    const effectiveCadence = reviewCadence && CADENCE[reviewCadence] && cadence === 'monthly'
      ? reviewCadence
      : cadence;

    if (!customerId) throw new Error('customerId is required');
    if (!csm) throw new Error('csm is required');
    // Y-103 goals may arrive with per-goal dueDates and no plan window.
    // Derive start/end from the goals when the caller omits them, but still
    // throw the legacy error when there's nothing at all to anchor the plan.
    if (!startDate || !endDate) {
      const derived = this._deriveWindowFromGoals(goals);
      if (derived && derived.start && derived.end) {
        startDate = startDate || derived.start;
        endDate = endDate || derived.end;
      } else {
        throw new Error('startDate and endDate are required');
      }
    }
    if (!CADENCE[effectiveCadence]) {
      throw new Error(`invalid cadence: ${effectiveCadence}`);
    }
    // Y-103 spec only allows weekly|biweekly|monthly|quarterly for reviewCadence.
    if (reviewCadence !== undefined && !REVIEW_CADENCES[reviewCadence]) {
      throw new Error(`invalid reviewCadence: ${reviewCadence}`);
    }

    const now = this._now();
    const id = this._nextPlanId();

    const visionObj = typeof vision === 'string'
      ? { he: vision, en: vision }
      : Object.assign({ he: '', en: '' }, vision || {});

    const plan = {
      id,
      customer_id: customerId,
      csm,
      start_date: toISO(startDate),
      end_date: toISO(endDate),
      vision: visionObj,
      cadence: effectiveCadence,
      review_cadence: effectiveCadence,
      status: 'active',
      status_he: PLAN_STATUS.active.he,
      status_en: PLAN_STATUS.active.en,
      at_risk_flag: false,
      at_risk_reason: null,
      notification_recipients: [],
      reviews: [],
      health_score: 0,
      health_label: 'yellow',
      renewal_score: 0,
      renewal_label: 'stable',
      goals: goals.map((g) => this._buildGoal(g, now)),
      stakeholders: stakeholders.map((s) => this._buildStakeholder(s)),
      risks: risks.map((r) => this._buildRisk(r)),
      milestones: milestones.map((m) => this._buildMilestone(m)),
      value_log: [],
      touchpoints: [],
      escalations: [],
      roi_snapshots: [],
      qbrs: [],
      decisions: [],
      history: [
        {
          id: this._nextHistoryId(),
          type: 'created',
          by: csm,
          at: now,
          note_he: 'תכנית נוצרה',
          note_en: 'plan created',
        },
      ],
      created_at: now,
      updated_at: now,
      archived_at: null,
    };

    // compute initial health + renewal snapshots
    const h = this._computeHealth(plan);
    plan.health_score = h.score;
    plan.health_label = h.label;
    const r = this._computeRenewal(plan);
    plan.renewal_score = r.score;
    plan.renewal_label = r.label;

    this._plans.set(id, plan);
    return clone(plan);
  }

  // ───────────────────────────────────────────────────────────
  // trackGoalProgress
  // ───────────────────────────────────────────────────────────
  trackGoalProgress({ planId, goalId, actual, notes = '', date } = {}) {
    const plan = this._requirePlan(planId);
    const goal = plan.goals.find((g) => g.id === goalId);
    if (!goal) throw new Error(`goal not found: ${goalId}`);

    const now = this._now();
    const at = toISO(date) || now;
    const entry = {
      actual,
      notes,
      at,
      pct: typeof actual === 'number' && typeof goal.target === 'number'
        ? round2(pct(actual, goal.target) * 100)
        : null,
    };
    goal.actuals.push(entry);
    goal.latest_actual = actual;
    goal.latest_pct = entry.pct;
    goal.updated_at = now;

    // Auto-derive status:
    //   >= 100% → achieved
    //   >=  80% → on_track
    //   >=  50% → at_risk
    //   < 50% of target, past due → off_track / missed
    if (typeof actual === 'number' && typeof goal.target === 'number' && goal.target > 0) {
      const ratio = actual / goal.target;
      if (ratio >= 1.0) goal.status = 'achieved';
      else if (ratio >= 0.8) goal.status = 'on_track';
      else if (ratio >= 0.5) goal.status = 'at_risk';
      else goal.status = 'off_track';

      // If past due and not achieved → missed
      if (goal.due_date && new Date(at) > new Date(goal.due_date) && ratio < 1.0) {
        goal.status = 'missed';
      }
    }

    plan.updated_at = now;
    // refresh plan-level scores
    const h = this._computeHealth(plan);
    plan.health_score = h.score;
    plan.health_label = h.label;
    const r = this._computeRenewal(plan);
    plan.renewal_score = r.score;
    plan.renewal_label = r.label;

    return clone(goal);
  }

  // ───────────────────────────────────────────────────────────
  // planHealth — overall % of goals on track
  // ───────────────────────────────────────────────────────────
  planHealth(planId) {
    const plan = this._requirePlan(planId);
    return this._computeHealth(plan);
  }

  _computeHealth(plan) {
    const goals = plan.goals || [];
    if (goals.length === 0) {
      return {
        score: 0,
        pct: 0,
        label: 'yellow',
        label_he: HEALTH_LABELS.yellow.he,
        label_en: HEALTH_LABELS.yellow.en,
        breakdown: { on_track: 0, at_risk: 0, off_track: 0, achieved: 0, missed: 0, not_started: 0 },
        total: 0,
      };
    }

    const breakdown = {
      not_started: 0,
      on_track: 0,
      at_risk: 0,
      off_track: 0,
      achieved: 0,
      missed: 0,
    };

    let weighted = 0;
    for (const g of goals) {
      const s = GOAL_STATUS[g.status] || GOAL_STATUS.not_started;
      breakdown[g.status] = (breakdown[g.status] || 0) + 1;
      weighted += s.weight;
    }

    const score = round2(weighted / goals.length);
    const onTrackCount = breakdown.on_track + breakdown.achieved;
    const onTrackPct = round2(onTrackCount / goals.length);

    let label = 'red';
    if (score >= HEALTH_LABELS.green.min) label = 'green';
    else if (score >= HEALTH_LABELS.yellow.min) label = 'yellow';

    // Penalty for critical risks
    const criticalRisks = (plan.risks || []).filter(
      (r) => r.severity === 'critical' && r.status !== 'resolved',
    ).length;
    const openEscalations = (plan.escalations || []).filter((e) => e.status !== 'resolved').length;

    let adjusted = score;
    if (criticalRisks > 0) adjusted = Math.max(0, adjusted - 0.15 * criticalRisks);
    if (openEscalations > 0) adjusted = Math.max(0, adjusted - 0.05 * openEscalations);

    let adjustedLabel = 'red';
    if (adjusted >= HEALTH_LABELS.green.min) adjustedLabel = 'green';
    else if (adjusted >= HEALTH_LABELS.yellow.min) adjustedLabel = 'yellow';

    return {
      score: round2(adjusted),
      raw_score: score,
      pct: onTrackPct,
      on_track_pct: onTrackPct,
      label: adjustedLabel,
      label_he: HEALTH_LABELS[adjustedLabel].he,
      label_en: HEALTH_LABELS[adjustedLabel].en,
      breakdown,
      total: goals.length,
      critical_risks: criticalRisks,
      open_escalations: openEscalations,
    };
  }

  // ───────────────────────────────────────────────────────────
  // quarterlyReview — QBR data prep
  // ───────────────────────────────────────────────────────────
  quarterlyReview({ planId, quarter } = {}) {
    const plan = this._requirePlan(planId);
    const q = quarter || this._currentQuarter();
    const now = this._now();

    const health = this._computeHealth(plan);
    const value = this._computeValue(plan);
    const renewal = this._computeRenewal(plan);

    const achieved = plan.goals.filter((g) => g.status === 'achieved');
    const atRisk = plan.goals.filter((g) => g.status === 'at_risk' || g.status === 'off_track');
    const upcomingMilestones = (plan.milestones || []).filter(
      (m) => m.status !== 'achieved' && m.target_date,
    ).sort((a, b) => new Date(a.target_date) - new Date(b.target_date)).slice(0, 5);

    const latestRoi = plan.roi_snapshots.length
      ? plan.roi_snapshots[plan.roi_snapshots.length - 1]
      : null;

    const qbr = {
      id: this._nextQbrId(),
      plan_id: plan.id,
      customer_id: plan.customer_id,
      quarter: q,
      generated_at: now,
      title: {
        he: `סקירת לקוח רבעונית — ${q}`,
        en: `Quarterly Business Review — ${q}`,
      },
      executive_summary: {
        he: `בריאות התכנית: ${health.label_he}. ${achieved.length}/${plan.goals.length} יעדים הושגו. ${atRisk.length} בסיכון.`,
        en: `Plan health: ${health.label_en}. ${achieved.length}/${plan.goals.length} goals achieved. ${atRisk.length} at risk.`,
      },
      sections: {
        health,
        value_realization: value,
        renewal_readiness: renewal,
        goals: {
          achieved: clone(achieved),
          at_risk: clone(atRisk),
          total: plan.goals.length,
        },
        milestones: clone(upcomingMilestones),
        stakeholder_map: this._buildStakeholderMap(plan),
        roi: latestRoi ? clone(latestRoi) : null,
        risks: clone((plan.risks || []).filter((r) => r.status !== 'resolved')),
        escalations: clone((plan.escalations || []).filter((e) => e.status !== 'resolved')),
      },
      next_steps_he: 'להגדיר פעולות רבעון הבא בפגישת סקירה',
      next_steps_en: 'Define next quarter actions in review meeting',
    };

    plan.qbrs.push(qbr);
    plan.updated_at = now;
    return clone(qbr);
  }

  _currentQuarter() {
    const d = new Date(this._now());
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q}-${d.getUTCFullYear()}`;
  }

  // ───────────────────────────────────────────────────────────
  // stakeholderMap
  // ───────────────────────────────────────────────────────────
  stakeholderMap(planId) {
    const plan = this._requirePlan(planId);
    return this._buildStakeholderMap(plan);
  }

  _buildStakeholderMap(plan) {
    const map = {
      exec_sponsor: [],
      champion: [],
      user_base: [],
      influencer: [],
      decision_makers: [],
      blockers: [],
      labels: {
        exec_sponsor: STAKEHOLDER_TYPES.exec_sponsor,
        champion: STAKEHOLDER_TYPES.champion,
        user_base: STAKEHOLDER_TYPES.user,
        influencer: STAKEHOLDER_TYPES.influencer,
        decision_makers: STAKEHOLDER_TYPES.decision,
        blockers: STAKEHOLDER_TYPES.blocker,
      },
    };

    for (const sh of plan.stakeholders || []) {
      switch (sh.type) {
        case 'exec_sponsor':
          map.exec_sponsor.push(clone(sh));
          break;
        case 'champion':
          map.champion.push(clone(sh));
          break;
        case 'user':
          map.user_base.push(clone(sh));
          break;
        case 'influencer':
          map.influencer.push(clone(sh));
          break;
        case 'decision':
          map.decision_makers.push(clone(sh));
          break;
        case 'blocker':
          map.blockers.push(clone(sh));
          break;
        default:
          map.user_base.push(clone(sh));
      }
    }

    map.total = (plan.stakeholders || []).length;
    map.coverage_score = this._stakeholderCoverage(map);
    return map;
  }

  _stakeholderCoverage(map) {
    // Healthy account needs: exec sponsor + champion + 3+ users
    let score = 0;
    if (map.exec_sponsor.length >= 1) score += 0.35;
    if (map.champion.length >= 1) score += 0.30;
    if (map.user_base.length >= 3) score += 0.20;
    else if (map.user_base.length >= 1) score += 0.10;
    if (map.blockers.length === 0) score += 0.15;
    return round2(score);
  }

  // ───────────────────────────────────────────────────────────
  // roiCalculation — customer's ROI from our product
  // ───────────────────────────────────────────────────────────
  roiCalculation({ planId, investments = [], returns = [] } = {}) {
    const plan = this._requirePlan(planId);
    const now = this._now();

    const sumAmounts = (arr) =>
      arr.reduce((acc, item) => {
        const amt = typeof item === 'number' ? item : Number(item && item.amount) || 0;
        return acc + amt;
      }, 0);

    const totalInvestment = sumAmounts(investments);
    const totalReturn = sumAmounts(returns);
    const netReturn = totalReturn - totalInvestment;
    const ratio = totalInvestment > 0 ? round2(netReturn / totalInvestment) : 0;
    const roiPct = totalInvestment > 0
      ? round2((netReturn / totalInvestment) * 100)
      : 0;

    // Payback period in months
    // Compute from monthly cashflow stream if individual items have `month` field
    let paybackMonths = null;
    if (totalReturn > 0 && totalInvestment > 0) {
      const monthlyReturn = totalReturn / 12;
      if (monthlyReturn > 0) {
        paybackMonths = round2(totalInvestment / monthlyReturn);
      }
    }

    const snapshot = {
      id: this._nextRoiId(),
      plan_id: plan.id,
      at: now,
      investments: clone(investments),
      returns: clone(returns),
      total_investment: round2(totalInvestment),
      total_return: round2(totalReturn),
      net_return: round2(netReturn),
      roi_ratio: ratio,
      roi_percentage: roiPct,
      payback_months: paybackMonths,
      label: {
        he: netReturn >= 0 ? 'החזר חיובי' : 'החזר שלילי',
        en: netReturn >= 0 ? 'Positive ROI' : 'Negative ROI',
      },
      currency: 'ILS',
    };

    plan.roi_snapshots.push(snapshot);
    plan.updated_at = now;
    return clone(snapshot);
  }

  // ───────────────────────────────────────────────────────────
  // escalation — escalation chain
  // ───────────────────────────────────────────────────────────
  escalation({ planId, issue, severity = 'medium', routedTo } = {}) {
    const plan = this._requirePlan(planId);
    if (!issue) throw new Error('issue is required');
    if (!SEVERITY[severity]) throw new Error(`invalid severity: ${severity}`);

    const now = this._now();
    const sevMeta = SEVERITY[severity];

    // Build standard escalation chain (append-only)
    const chain = this._buildEscalationChain(severity, plan.csm, routedTo);

    const esc = {
      id: this._nextEscId(),
      plan_id: plan.id,
      customer_id: plan.customer_id,
      issue,
      severity,
      severity_he: sevMeta.he,
      severity_en: sevMeta.en,
      sla_hours: sevMeta.sla_hours,
      routed_to: routedTo || chain[0],
      chain,
      status: 'open',
      opened_at: now,
      updated_at: now,
      resolved_at: null,
      history: [
        {
          at: now,
          action: 'opened',
          by: plan.csm,
          note_he: 'אסקלציה נפתחה',
          note_en: 'escalation opened',
        },
      ],
    };

    plan.escalations.push(esc);
    plan.updated_at = now;

    // Recompute health — escalation may push plan into yellow/red
    const h = this._computeHealth(plan);
    plan.health_score = h.score;
    plan.health_label = h.label;

    return clone(esc);
  }

  _buildEscalationChain(severity, csm, routedTo) {
    const base = [csm, 'csm_lead', 'account_director'];
    if (severity === 'high') base.push('vp_customer_success');
    if (severity === 'critical') {
      base.push('vp_customer_success');
      base.push('cro');
      base.push('ceo');
    }
    if (routedTo && !base.includes(routedTo)) base.unshift(routedTo);
    // Dedup while preserving order
    const seen = new Set();
    return base.filter((x) => {
      if (!x || seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  }

  // ───────────────────────────────────────────────────────────
  // updatePlanWithCustomer — joint review
  // ───────────────────────────────────────────────────────────
  updatePlanWithCustomer({ planId, reviewDate, decisions = [], changes = {} } = {}) {
    const plan = this._requirePlan(planId);
    const now = this._now();
    const at = toISO(reviewDate) || now;

    // Append-only history record — NEVER overwrite old state
    const historyEntry = {
      id: this._nextHistoryId(),
      type: 'joint_review',
      at,
      by: plan.csm,
      reviewer_count: Array.isArray(changes.attendees) ? changes.attendees.length : 0,
      attendees: clone(changes.attendees || []),
      decisions: clone(decisions),
      changes: clone(changes),
      snapshot_before: {
        goals: clone(plan.goals),
        risks: clone(plan.risks),
        milestones: clone(plan.milestones),
        stakeholders: clone(plan.stakeholders),
        cadence: plan.cadence,
      },
      note_he: 'סקירה משותפת עם הלקוח',
      note_en: 'joint review with customer',
    };
    plan.history.push(historyEntry);
    plan.decisions.push(...decisions.map((d, i) => ({
      id: `dec_${plan.id}_${plan.decisions.length + i + 1}`,
      at,
      text: typeof d === 'string' ? d : (d && d.text) || '',
      owner: (d && d.owner) || plan.csm,
      due_date: (d && d.dueDate) || null,
      status: 'open',
    })));

    // Apply non-destructive changes (UPGRADE, never delete):
    //  - new goals are ADDED
    //  - existing goals can be patched by id
    //  - new stakeholders are ADDED
    //  - new risks/milestones are APPENDED
    //  - cadence can be changed (audit-trailed)
    if (Array.isArray(changes.newGoals)) {
      for (const g of changes.newGoals) plan.goals.push(this._buildGoal(g, now));
    }
    if (Array.isArray(changes.goalPatches)) {
      for (const patch of changes.goalPatches) {
        const existing = plan.goals.find((g) => g.id === patch.id);
        if (existing) {
          if (patch.status && GOAL_STATUS[patch.status]) existing.status = patch.status;
          if (patch.target !== undefined) existing.target = patch.target;
          if (patch.dueDate) existing.due_date = toISO(patch.dueDate);
          existing.updated_at = now;
        }
      }
    }
    if (Array.isArray(changes.newStakeholders)) {
      for (const s of changes.newStakeholders) plan.stakeholders.push(this._buildStakeholder(s));
    }
    if (Array.isArray(changes.newRisks)) {
      for (const r of changes.newRisks) plan.risks.push(this._buildRisk(r));
    }
    if (Array.isArray(changes.newMilestones)) {
      for (const m of changes.newMilestones) plan.milestones.push(this._buildMilestone(m));
    }
    if (changes.cadence && CADENCE[changes.cadence]) {
      plan.cadence = changes.cadence;
    }
    if (changes.vision) {
      plan.vision = typeof changes.vision === 'string'
        ? { he: changes.vision, en: changes.vision }
        : Object.assign({}, plan.vision, changes.vision);
    }

    plan.updated_at = now;
    const h = this._computeHealth(plan);
    plan.health_score = h.score;
    plan.health_label = h.label;
    const r = this._computeRenewal(plan);
    plan.renewal_score = r.score;
    plan.renewal_label = r.label;

    return clone(plan);
  }

  // ───────────────────────────────────────────────────────────
  // generateExecutivePDF — bilingual executive deck
  // Produces a minimal valid PDF in pure JS (no dependencies).
  // ───────────────────────────────────────────────────────────
  generateExecutivePDF(planId) {
    const plan = this._requirePlan(planId);
    const health = this._computeHealth(plan);
    const value = this._computeValue(plan);
    const renewal = this._computeRenewal(plan);

    const lines = [
      'Customer Success Plan — Executive Deck',
      'תכנית הצלחת לקוח — תקציר מנהלים',
      `Plan ID: ${plan.id}`,
      `Customer: ${plan.customer_id}`,
      `CSM: ${plan.csm}`,
      `Period: ${plan.start_date} to ${plan.end_date}`,
      '',
      `Vision / חזון (EN): ${plan.vision.en}`,
      `Vision / חזון (HE): ${plan.vision.he}`,
      '',
      `Health: ${health.label_en} / ${health.label_he} (${health.score})`,
      `Goals on track: ${Math.round(health.on_track_pct * 100)}% (${health.total} total)`,
      `Value delivered: ${value.pct}% (${value.delivered}/${value.planned})`,
      `Renewal readiness: ${renewal.label_en} / ${renewal.label_he} (${renewal.score})`,
      '',
      `Stakeholders: ${plan.stakeholders.length}`,
      `Open risks: ${(plan.risks || []).filter((r) => r.status !== 'resolved').length}`,
      `Open escalations: ${(plan.escalations || []).filter((e) => e.status !== 'resolved').length}`,
      `Milestones: ${plan.milestones.length}`,
    ];

    const text = lines.join('\n');
    const bytes = this._buildMinimalPdf(text);
    const pdf_base64 = Buffer.from(bytes).toString('base64');

    return {
      plan_id: plan.id,
      bytes,
      pdf_base64,
      content_type: 'application/pdf',
      pages: 1,
      bilingual: true,
      generated_at: this._now(),
      text,
    };
  }

  /**
   * Build a minimal-but-valid PDF 1.4 document in pure Node. No deps.
   * Supports 1 page of plain ASCII text — enough for executive summaries.
   * Non-ASCII characters (Hebrew) are filtered to avoid encoding blowups;
   * the full bilingual payload is available separately in the `text` field.
   */
  _buildMinimalPdf(rawText) {
    // Filter to Latin-1 printable to keep builtin Helvetica happy
    const lines = rawText.split('\n').map((ln) =>
      ln.replace(/[^\x20-\x7E]/g, '?').replace(/[()\\]/g, '\\$&'),
    );

    const streamLines = [];
    streamLines.push('BT');
    streamLines.push('/F1 12 Tf');
    streamLines.push('50 780 Td');
    streamLines.push(`(${lines[0] || ''}) Tj`);
    for (let i = 1; i < lines.length; i++) {
      streamLines.push('0 -16 Td');
      streamLines.push(`(${lines[i]}) Tj`);
    }
    streamLines.push('ET');
    const stream = streamLines.join('\n');

    const objects = [];
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const off of offsets) {
      pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(pdf, 'binary');
  }

  // ───────────────────────────────────────────────────────────
  // cadenceTracker — regular touchpoints
  // ───────────────────────────────────────────────────────────
  cadenceTracker({ planId, cadence } = {}) {
    const plan = this._requirePlan(planId);
    const c = cadence || plan.cadence;
    if (!CADENCE[c]) throw new Error(`invalid cadence: ${c}`);

    const meta = CADENCE[c];
    const now = this._now();
    const nowDate = new Date(now);
    const startDate = new Date(plan.start_date);
    const endDate = new Date(plan.end_date);

    // Generate the scheduled touchpoint stream
    const scheduled = [];
    let cursor = new Date(startDate.getTime());
    let idx = 0;
    const maxIter = 500;
    while (cursor <= endDate && idx < maxIter) {
      scheduled.push({
        scheduled_at: cursor.toISOString(),
        cadence: c,
        status: cursor < nowDate ? 'past' : 'upcoming',
      });
      cursor = new Date(cursor.getTime() + meta.days * 86400000);
      idx++;
    }

    // Mark overdue (past and not logged as touchpoint)
    const logged = plan.touchpoints.map((t) => t.scheduled_at);
    const overdue = scheduled.filter(
      (s) => s.status === 'past' && !logged.includes(s.scheduled_at),
    );
    const upcoming = scheduled.filter((s) => s.status === 'upcoming').slice(0, 5);

    // Register tracker as touchpoint snapshot (append-only)
    const tp = {
      id: this._nextTouchId(),
      plan_id: plan.id,
      cadence: c,
      cadence_he: meta.he,
      cadence_en: meta.en,
      generated_at: now,
      total_scheduled: scheduled.length,
      logged_count: plan.touchpoints.length,
      overdue_count: overdue.length,
      upcoming_count: upcoming.length,
    };
    plan.touchpoints.push(tp);

    return {
      cadence: c,
      cadence_he: meta.he,
      cadence_en: meta.en,
      total: scheduled.length,
      next_touchpoints: upcoming,
      overdue,
      logged: plan.touchpoints.length,
      generated_at: now,
    };
  }

  // ───────────────────────────────────────────────────────────
  // valueRealization — value delivered vs planned
  // ───────────────────────────────────────────────────────────
  valueRealization(planId) {
    const plan = this._requirePlan(planId);
    return this._computeValue(plan);
  }

  _computeValue(plan) {
    // Value is the sum of goal targets (planned) vs. latest actuals (delivered)
    let planned = 0;
    let delivered = 0;

    for (const g of plan.goals || []) {
      if (typeof g.target === 'number') planned += g.target;
      if (typeof g.latest_actual === 'number') delivered += g.latest_actual;
    }

    const gap = planned - delivered;
    const pctDelivered = planned > 0 ? round2((delivered / planned) * 100) : 0;

    return {
      plan_id: plan.id,
      planned: round2(planned),
      delivered: round2(delivered),
      gap: round2(gap),
      pct: pctDelivered,
      label: {
        he: pctDelivered >= 80 ? 'ערך ממומש' : pctDelivered >= 50 ? 'ערך חלקי' : 'ערך נמוך',
        en: pctDelivered >= 80 ? 'Value realized' : pctDelivered >= 50 ? 'Partial value' : 'Low value',
      },
      computed_at: this._now(),
    };
  }

  // ───────────────────────────────────────────────────────────
  // renewalReadiness — likelihood to renew
  // ───────────────────────────────────────────────────────────
  renewalReadiness(planId) {
    const plan = this._requirePlan(planId);
    return this._computeRenewal(plan);
  }

  _computeRenewal(plan) {
    const factors = [];
    let score = 0;

    // 1) Health contribution (40%)
    const h = this._computeHealth(plan);
    const healthContrib = round2(h.score * 0.40);
    score += healthContrib;
    factors.push({
      key: 'plan_health',
      label_he: 'בריאות התכנית',
      label_en: 'Plan health',
      weight: 0.40,
      value: h.score,
      contribution: healthContrib,
    });

    // 2) Stakeholder coverage (20%)
    const map = this._buildStakeholderMap(plan);
    const stakeContrib = round2(map.coverage_score * 0.20);
    score += stakeContrib;
    factors.push({
      key: 'stakeholder_coverage',
      label_he: 'כיסוי בעלי עניין',
      label_en: 'Stakeholder coverage',
      weight: 0.20,
      value: map.coverage_score,
      contribution: stakeContrib,
    });

    // 3) Value realization (25%)
    const v = this._computeValue(plan);
    const valueFrac = v.pct / 100;
    const valueContrib = round2(valueFrac * 0.25);
    score += valueContrib;
    factors.push({
      key: 'value_realization',
      label_he: 'מימוש ערך',
      label_en: 'Value realization',
      weight: 0.25,
      value: valueFrac,
      contribution: valueContrib,
    });

    // 4) ROI signal (15%)
    const latest = plan.roi_snapshots[plan.roi_snapshots.length - 1];
    let roiFrac = 0;
    if (latest && typeof latest.roi_ratio === 'number') {
      // ROI ratio ≥ 1 = great, 0-1 = good, negative = poor
      if (latest.roi_ratio >= 1) roiFrac = 1;
      else if (latest.roi_ratio > 0) roiFrac = 0.6;
      else if (latest.roi_ratio === 0) roiFrac = 0.3;
      else roiFrac = 0;
    }
    const roiContrib = round2(roiFrac * 0.15);
    score += roiContrib;
    factors.push({
      key: 'roi',
      label_he: 'החזר השקעה',
      label_en: 'ROI',
      weight: 0.15,
      value: roiFrac,
      contribution: roiContrib,
    });

    const finalScore = round2(Math.max(0, Math.min(1, score)));

    let label = 'critical';
    if (finalScore >= 0.75) label = 'likely';
    else if (finalScore >= 0.55) label = 'stable';
    else if (finalScore >= 0.35) label = 'at_risk';

    return {
      plan_id: plan.id,
      score: finalScore,
      label,
      label_he: RENEWAL_LABELS[label].he,
      label_en: RENEWAL_LABELS[label].en,
      factors,
      computed_at: this._now(),
    };
  }

  // ───────────────────────────────────────────────────────────
  // Helpers — builders
  // ───────────────────────────────────────────────────────────
  _buildGoal(g, now) {
    const status = g.status && GOAL_STATUS[g.status] ? g.status : 'not_started';
    // Y-103 upgrade: accept either {description_*} (legacy) or {name_*} (spec).
    // Both shapes are preserved side-by-side — nothing is dropped.
    const nameHe = g.name_he || g.description_he || g.description || '';
    const nameEn = g.name_en || g.description_en || g.description || '';
    const baselineVal = g.baseline !== undefined ? g.baseline : null;
    const weightVal = typeof g.weight === 'number' && g.weight > 0 ? g.weight : 1;
    return {
      id: g.id || this._nextGoalId(),
      name_he: nameHe,
      name_en: nameEn,
      description_he: nameHe,
      description_en: nameEn,
      metric: g.metric || '',
      target: g.target !== undefined ? g.target : null,
      baseline: baselineVal,
      weight: weightVal,
      owner: g.owner || '',
      due_date: toISO(g.dueDate || g.due_date) || null,
      status,
      status_he: GOAL_STATUS[status].he,
      status_en: GOAL_STATUS[status].en,
      actuals: [],
      latest_actual: null,
      latest_pct: null,
      current_value: null,
      created_at: now,
      updated_at: now,
    };
  }

  _buildStakeholder(s) {
    const type = s.type && STAKEHOLDER_TYPES[s.type] ? s.type : 'user';
    return {
      id: s.id || this._nextStakeholderId(),
      name: s.name || '',
      role: s.role || '',
      influence: s.influence || 'medium',
      sentiment: s.sentiment || 'neutral',
      email: s.email || '',
      phone: s.phone || '',
      type,
      type_he: STAKEHOLDER_TYPES[type].he,
      type_en: STAKEHOLDER_TYPES[type].en,
    };
  }

  _buildRisk(r) {
    const severity = r.severity && SEVERITY[r.severity] ? r.severity : 'medium';
    return {
      id: r.id || this._nextRiskId(),
      description_he: r.description_he || r.description || '',
      description_en: r.description_en || r.description || '',
      severity,
      severity_he: SEVERITY[severity].he,
      severity_en: SEVERITY[severity].en,
      mitigation: r.mitigation || '',
      owner: r.owner || '',
      status: r.status || 'open',
      identified_at: toISO(r.identifiedAt) || this._now(),
    };
  }

  _buildMilestone(m) {
    return {
      id: m.id || this._nextMilestoneId(),
      name_he: m.name_he || m.name || '',
      name_en: m.name_en || m.name || '',
      target_date: toISO(m.targetDate || m.target_date) || null,
      achieved_date: toISO(m.achievedDate || m.achieved_date) || null,
      status: m.status || 'upcoming',
      description: m.description || '',
    };
  }

  // ───────────────────────────────────────────────────────────
  // Accessors
  // ───────────────────────────────────────────────────────────
  getPlan(planId) {
    const plan = this._plans.get(planId);
    return plan ? clone(plan) : null;
  }

  listPlans(filter = {}) {
    const out = [];
    for (const plan of this._plans.values()) {
      if (filter.customerId && plan.customer_id !== filter.customerId) continue;
      if (filter.csm && plan.csm !== filter.csm) continue;
      if (filter.status && plan.status !== filter.status) continue;
      out.push(clone(plan));
    }
    return out;
  }

  _requirePlan(planId) {
    const plan = this._plans.get(planId);
    if (!plan) throw new Error(`plan not found: ${planId}`);
    return plan;
  }

  // ═════════════════════════════════════════════════════════════
  // Y-103 EXTENSION METHODS
  // לא מוחקים רק משדרגים ומגדלים — append-only, every old field preserved.
  // ═════════════════════════════════════════════════════════════

  _deriveWindowFromGoals(goals) {
    if (!Array.isArray(goals) || goals.length === 0) return null;
    const dates = [];
    for (const g of goals) {
      const d = g && (g.dueDate || g.due_date);
      if (d) {
        const t = parseDate(d);
        if (t && !isNaN(t.getTime())) dates.push(t);
      }
    }
    if (dates.length === 0) return null;
    const max = new Date(Math.max.apply(null, dates.map((d) => d.getTime())));
    const min = new Date(Math.min.apply(null, dates.map((d) => d.getTime())));
    const start = new Date(min.getTime() - 30 * 86400000);
    const end = new Date(max.getTime() + 30 * 86400000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  // ─────────────────────────────────────────────────────────────
  // updateMilestone — record a new actual, append to history.
  // Accepts Y-103 signature: {planId, goalId, currentValue, notes, updatedBy}.
  // Internally reuses trackGoalProgress so every existing invariant still holds.
  // ─────────────────────────────────────────────────────────────
  updateMilestone({ planId, goalId, currentValue, notes = '', updatedBy, date } = {}) {
    const plan = this._requirePlan(planId);
    const goal = plan.goals.find((g) => g.id === goalId);
    if (!goal) throw new Error(`goal not found: ${goalId}`);

    const now = this._now();
    const at = toISO(date) || now;
    const prevValue = goal.current_value;

    // Append-only: prior actual is kept intact, a new one is pushed.
    const updated = this.trackGoalProgress({
      planId,
      goalId,
      actual: currentValue,
      notes,
      date: at,
    });
    // reacquire live goal reference (trackGoalProgress returns a clone)
    const live = plan.goals.find((g) => g.id === goalId);
    live.current_value = currentValue;
    live.actuals[live.actuals.length - 1].updated_by = updatedBy || plan.csm;

    plan.history.push({
      id: this._nextHistoryId(),
      type: 'milestone_update',
      at,
      by: updatedBy || plan.csm,
      goal_id: goalId,
      previous_value: prevValue,
      new_value: currentValue,
      notes,
      note_he: 'עדכון אבן דרך',
      note_en: 'milestone updated',
    });
    plan.updated_at = now;
    return clone(Object.assign({}, updated, { current_value: currentValue }));
  }

  // ─────────────────────────────────────────────────────────────
  // computeProgress — weighted progress across goals, 0-100%.
  // Each goal contributes its normalized progress (current/target) × weight.
  // Baseline is honored: progress = (current - baseline) / (target - baseline).
  // ─────────────────────────────────────────────────────────────
  computeProgress(planId) {
    const plan = this._requirePlan(planId);
    const goals = plan.goals || [];
    if (goals.length === 0) {
      return {
        plan_id: plan.id,
        progress: 0,
        progress_pct: 0,
        total_weight: 0,
        goal_count: 0,
        per_goal: [],
        computed_at: this._now(),
        label_he: 'ללא יעדים',
        label_en: 'No goals',
      };
    }

    let weightedSum = 0;
    let totalWeight = 0;
    const perGoal = [];

    for (const g of goals) {
      const w = typeof g.weight === 'number' && g.weight > 0 ? g.weight : 1;
      totalWeight += w;

      let frac = 0;
      const current = typeof g.current_value === 'number'
        ? g.current_value
        : (typeof g.latest_actual === 'number' ? g.latest_actual : null);

      if (g.status === 'achieved') {
        frac = 1;
      } else if (typeof current === 'number' && typeof g.target === 'number') {
        const base = typeof g.baseline === 'number' ? g.baseline : 0;
        const denom = g.target - base;
        if (denom === 0) {
          frac = current >= g.target ? 1 : 0;
        } else {
          frac = (current - base) / denom;
        }
        if (frac < 0) frac = 0;
        if (frac > 1) frac = 1;
      }

      weightedSum += frac * w;
      perGoal.push({
        id: g.id,
        name_he: g.name_he || g.description_he,
        name_en: g.name_en || g.description_en,
        weight: w,
        current,
        baseline: g.baseline,
        target: g.target,
        progress: round2(frac),
        contribution: round2((frac * w) / (totalWeight || 1)),
      });
    }

    const progress = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const progressPct = round2(Math.max(0, Math.min(1, progress)) * 100);

    return {
      plan_id: plan.id,
      progress: round2(progress),
      progress_pct: progressPct,
      total_weight: round2(totalWeight),
      goal_count: goals.length,
      per_goal: perGoal,
      computed_at: this._now(),
      label_he: progressPct >= 80 ? 'מתקדם' : progressPct >= 50 ? 'חלקי' : 'נמוך',
      label_en: progressPct >= 80 ? 'Advanced' : progressPct >= 50 ? 'Partial' : 'Low',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // riskAssessment — green/yellow/red based on progress vs. timeline.
  // Compares the plan's weighted progress against the time elapsed in the
  // plan window. If progress keeps pace with elapsed time → green.
  // ─────────────────────────────────────────────────────────────
  riskAssessment(planId) {
    const plan = this._requirePlan(planId);
    const now = new Date(this._now());
    const start = new Date(plan.start_date);
    const end = new Date(plan.end_date);
    const totalMs = end.getTime() - start.getTime();
    const elapsedMs = Math.max(0, Math.min(totalMs, now.getTime() - start.getTime()));
    const timeElapsed = totalMs > 0 ? elapsedMs / totalMs : 0;

    const prog = this.computeProgress(planId);
    const progressFrac = prog.progress;  // 0..1

    // Ratio of achievement to expected (elapsed) pace.
    // If timeElapsed = 0 (plan not started) we start from green.
    let ratio;
    if (timeElapsed <= 0) ratio = 1;
    else ratio = progressFrac / timeElapsed;

    let band = 'red';
    if (ratio >= RISK_BANDS.green.min) band = 'green';
    else if (ratio >= RISK_BANDS.yellow.min) band = 'yellow';

    // Critical risks / open escalations downgrade the band.
    const criticalRisks = (plan.risks || []).filter(
      (r) => r.severity === 'critical' && r.status !== 'resolved',
    ).length;
    if (criticalRisks > 0 && band === 'green') band = 'yellow';
    if (criticalRisks >= 2 && band === 'yellow') band = 'red';

    // If plan was already marked at risk, floor at yellow.
    if (plan.at_risk_flag && band === 'green') band = 'yellow';

    return {
      plan_id: plan.id,
      band,
      band_he: RISK_BANDS[band].he,
      band_en: RISK_BANDS[band].en,
      progress: progressFrac,
      time_elapsed: round2(timeElapsed),
      pace_ratio: round2(ratio),
      critical_risks: criticalRisks,
      at_risk_flag: !!plan.at_risk_flag,
      assessed_at: this._now(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // addMilestone — append a new goal. Existing goals are never removed.
  // ─────────────────────────────────────────────────────────────
  addMilestone(planId, goal) {
    const plan = this._requirePlan(planId);
    if (!goal || typeof goal !== 'object') throw new Error('goal is required');
    const now = this._now();
    const built = this._buildGoal(goal, now);
    plan.goals.push(built);
    plan.history.push({
      id: this._nextHistoryId(),
      type: 'milestone_added',
      at: now,
      by: plan.csm,
      goal_id: built.id,
      note_he: 'אבן דרך חדשה נוספה',
      note_en: 'milestone added',
    });
    plan.updated_at = now;
    return clone(built);
  }

  // ─────────────────────────────────────────────────────────────
  // markAtRisk — flag the plan and attach notification recipients.
  // Never downgrades; can be called multiple times (history grows).
  // ─────────────────────────────────────────────────────────────
  markAtRisk(planId, reason) {
    const plan = this._requirePlan(planId);
    if (!reason || typeof reason !== 'string') throw new Error('reason is required');
    const now = this._now();

    plan.at_risk_flag = true;
    plan.at_risk_reason = reason;

    const recipients = Array.from(new Set([
      plan.csm,
      'csm_manager',
      'vp_cs',
      ...((plan.stakeholders || [])
        .filter((s) => s.type === 'exec_sponsor' && s.email)
        .map((s) => s.email)),
    ].filter(Boolean)));

    plan.notification_recipients = recipients;

    plan.history.push({
      id: this._nextHistoryId(),
      type: 'marked_at_risk',
      at: now,
      by: plan.csm,
      reason,
      recipients,
      note_he: 'התכנית סומנה בסיכון',
      note_en: 'plan marked at risk',
    });
    plan.updated_at = now;

    return {
      plan_id: plan.id,
      at_risk: true,
      reason,
      recipients,
      reason_he: reason,
      reason_en: reason,
      notified_at: now,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // escalate — escalate to CSM manager → VP CS → executive.
  // Pure spec-driven ladder; companion to the richer escalation() method.
  // ─────────────────────────────────────────────────────────────
  escalate(planId, level) {
    const plan = this._requirePlan(planId);
    const lvl = ESCALATION_LEVELS[level];
    if (!lvl) throw new Error(`invalid escalation level: ${level}`);
    const now = this._now();

    const record = {
      id: this._nextEscId(),
      plan_id: plan.id,
      level,
      level_order: lvl.order,
      level_he: lvl.he,
      level_en: lvl.en,
      recipients: lvl.recipients.slice(),
      triggered_by: plan.csm,
      at: now,
      status: 'open',
      note_he: `הסלמה לרמת ${lvl.he}`,
      note_en: `escalated to ${lvl.en}`,
    };

    plan.escalations.push(record);
    plan.history.push({
      id: this._nextHistoryId(),
      type: 'escalation',
      at: now,
      by: plan.csm,
      level,
      recipients: lvl.recipients.slice(),
      note_he: record.note_he,
      note_en: record.note_en,
    });
    plan.updated_at = now;

    return clone(record);
  }

  // ─────────────────────────────────────────────────────────────
  // scheduleReview — schedule the next customer review meeting.
  // ─────────────────────────────────────────────────────────────
  scheduleReview(planId, date, attendees = []) {
    const plan = this._requirePlan(planId);
    if (!date) throw new Error('date is required');
    const scheduledAt = toISO(date);
    const now = this._now();

    const review = {
      id: `rev_${plan.id}_${plan.reviews.length + 1}`,
      plan_id: plan.id,
      scheduled_at: scheduledAt,
      attendees: Array.isArray(attendees) ? attendees.slice() : [],
      cadence: plan.cadence,
      cadence_he: CADENCE[plan.cadence] ? CADENCE[plan.cadence].he : '',
      cadence_en: CADENCE[plan.cadence] ? CADENCE[plan.cadence].en : '',
      status: 'scheduled',
      title_he: 'סקירת הצלחת לקוח',
      title_en: 'Customer success review',
      created_at: now,
      created_by: plan.csm,
    };

    plan.reviews.push(review);
    plan.history.push({
      id: this._nextHistoryId(),
      type: 'review_scheduled',
      at: now,
      by: plan.csm,
      review_id: review.id,
      scheduled_at: scheduledAt,
      attendees: review.attendees.slice(),
      note_he: 'נקבעה סקירה חדשה',
      note_en: 'review scheduled',
    });
    plan.updated_at = now;

    return clone(review);
  }

  // ─────────────────────────────────────────────────────────────
  // generateDeck — bilingual HTML success review deck.
  // `lang` is one of 'he' | 'en' | 'both' (default). Always RTL-safe.
  // ─────────────────────────────────────────────────────────────
  generateDeck(planId, lang = 'both') {
    const plan = this._requirePlan(planId);
    const health = this._computeHealth(plan);
    const value = this._computeValue(plan);
    const renewal = this._computeRenewal(plan);
    const progress = this.computeProgress(planId);
    const risk = this.riskAssessment(planId);
    const now = this._now();

    const includeHe = lang === 'he' || lang === 'both';
    const includeEn = lang === 'en' || lang === 'both';

    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const rows = plan.goals.map((g) => {
      const p = progress.per_goal.find((x) => x.id === g.id) || {};
      return `
        <tr>
          <td>${esc(g.id)}</td>
          <td dir="rtl">${esc(g.name_he || g.description_he)}</td>
          <td>${esc(g.name_en || g.description_en)}</td>
          <td>${esc(g.metric)}</td>
          <td>${esc(g.baseline)}</td>
          <td>${esc(g.target)}</td>
          <td>${esc(g.current_value != null ? g.current_value : g.latest_actual)}</td>
          <td>${esc(Math.round((p.progress || 0) * 100))}%</td>
          <td>${esc(g.weight)}</td>
          <td>${esc(GOAL_STATUS[g.status] ? GOAL_STATUS[g.status].en : g.status)}</td>
        </tr>`;
    }).join('');

    const hebrewBlock = includeHe ? `
    <section dir="rtl" lang="he" class="he">
      <h1>תכנית הצלחת לקוח — ${esc(plan.customer_id)}</h1>
      <h2>תקציר מנהלים</h2>
      <p>מנהל/ת לקוח: ${esc(plan.csm)}</p>
      <p>סטטוס: ${esc(PLAN_STATUS[plan.status] ? PLAN_STATUS[plan.status].he : plan.status)}</p>
      <p>קצב סקירה: ${esc(CADENCE[plan.cadence] ? CADENCE[plan.cadence].he : plan.cadence)}</p>
      <p>חזון: ${esc(plan.vision.he)}</p>
      <p>בריאות: ${esc(health.label_he)} (${esc(health.score)})</p>
      <p>התקדמות משוקללת: ${esc(progress.progress_pct)}%</p>
      <p>רמת סיכון: ${esc(risk.band_he)}</p>
      <p>מימוש ערך: ${esc(value.pct)}%</p>
      <p>סיכוי חידוש: ${esc(renewal.label_he)}</p>
    </section>` : '';

    const englishBlock = includeEn ? `
    <section dir="ltr" lang="en" class="en">
      <h1>Customer Success Plan — ${esc(plan.customer_id)}</h1>
      <h2>Executive Summary</h2>
      <p>CSM: ${esc(plan.csm)}</p>
      <p>Status: ${esc(PLAN_STATUS[plan.status] ? PLAN_STATUS[plan.status].en : plan.status)}</p>
      <p>Review cadence: ${esc(CADENCE[plan.cadence] ? CADENCE[plan.cadence].en : plan.cadence)}</p>
      <p>Vision: ${esc(plan.vision.en)}</p>
      <p>Health: ${esc(health.label_en)} (${esc(health.score)})</p>
      <p>Weighted progress: ${esc(progress.progress_pct)}%</p>
      <p>Risk band: ${esc(risk.band_en)}</p>
      <p>Value realized: ${esc(value.pct)}%</p>
      <p>Renewal readiness: ${esc(renewal.label_en)}</p>
    </section>` : '';

    const html = `<!doctype html>
<html lang="${includeHe && !includeEn ? 'he' : 'en'}" dir="${includeHe && !includeEn ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8"/>
  <title>Customer Success Plan — ${esc(plan.customer_id)}</title>
  <style>
    body { font-family: system-ui, Arial, sans-serif; margin: 2rem; }
    section.he { direction: rtl; text-align: right; background: #f6f8fa; padding: 1rem; border-radius: 8px; }
    section.en { direction: ltr; text-align: left; background: #eef5ff; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 14px; }
    th { background: #1e293b; color: #fff; }
  </style>
</head>
<body>
${hebrewBlock}
${englishBlock}
    <h2>${includeHe ? 'יעדים / ' : ''}Goals</h2>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>שם</th>
          <th>Name</th>
          <th>Metric</th>
          <th>Baseline</th>
          <th>Target</th>
          <th>Current</th>
          <th>Progress</th>
          <th>Weight</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <footer>
      <p>Generated at ${esc(now)} | ${esc(plan.id)}</p>
    </footer>
</body>
</html>`;

    return {
      plan_id: plan.id,
      lang,
      content_type: 'text/html; charset=utf-8',
      html,
      generated_at: now,
      bilingual: lang === 'both',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // aggregatePortfolio — all plans owned by a CSM, with totals.
  // ─────────────────────────────────────────────────────────────
  aggregatePortfolio(csmId) {
    if (!csmId) throw new Error('csmId is required');
    const plans = [];
    const byBand = { green: 0, yellow: 0, red: 0 };
    const byStatus = {};
    let totalProgress = 0;
    let totalGoals = 0;

    for (const plan of this._plans.values()) {
      if (plan.csm !== csmId) continue;
      const risk = this.riskAssessment(plan.id);
      const prog = this.computeProgress(plan.id);
      byBand[risk.band] = (byBand[risk.band] || 0) + 1;
      byStatus[plan.status] = (byStatus[plan.status] || 0) + 1;
      totalProgress += prog.progress_pct;
      totalGoals += plan.goals.length;
      plans.push({
        id: plan.id,
        customer_id: plan.customer_id,
        status: plan.status,
        status_he: PLAN_STATUS[plan.status] ? PLAN_STATUS[plan.status].he : plan.status,
        status_en: PLAN_STATUS[plan.status] ? PLAN_STATUS[plan.status].en : plan.status,
        cadence: plan.cadence,
        risk_band: risk.band,
        risk_band_he: risk.band_he,
        risk_band_en: risk.band_en,
        progress_pct: prog.progress_pct,
        goals_count: plan.goals.length,
        at_risk_flag: !!plan.at_risk_flag,
      });
    }

    const avgProgress = plans.length > 0 ? round2(totalProgress / plans.length) : 0;

    return {
      csm: csmId,
      total: plans.length,
      plans,
      totals: {
        green: byBand.green || 0,
        yellow: byBand.yellow || 0,
        red: byBand.red || 0,
        goals: totalGoals,
        avg_progress_pct: avgProgress,
      },
      by_status: byStatus,
      label_he: 'תיק תכניות הצלחה',
      label_en: 'Customer success portfolio',
      computed_at: this._now(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // graduatePlan — mark a plan as successfully completed.
  // Preserves the full record — history, goals, decisions all survive.
  // ─────────────────────────────────────────────────────────────
  graduatePlan(planId) {
    const plan = this._requirePlan(planId);
    const now = this._now();

    const prevStatus = plan.status;
    plan.status = 'graduated';
    plan.status_he = PLAN_STATUS.graduated.he;
    plan.status_en = PLAN_STATUS.graduated.en;
    plan.graduated_at = now;
    plan.updated_at = now;

    plan.history.push({
      id: this._nextHistoryId(),
      type: 'graduated',
      at: now,
      by: plan.csm,
      previous_status: prevStatus,
      goal_count: plan.goals.length,
      decisions_count: plan.decisions.length,
      history_count: plan.history.length,
      note_he: 'התכנית הושלמה בהצלחה',
      note_en: 'plan graduated successfully',
    });

    return clone(plan);
  }

  // ─────────────────────────────────────────────────────────────
  // closeUnsuccessful — status flip, history preserved.
  // Nothing is deleted — the entire audit trail stays queryable.
  // ─────────────────────────────────────────────────────────────
  closeUnsuccessful(planId, reason) {
    const plan = this._requirePlan(planId);
    if (!reason || typeof reason !== 'string') throw new Error('reason is required');
    const now = this._now();

    const prevStatus = plan.status;
    plan.status = 'closed_unsuccessful';
    plan.status_he = PLAN_STATUS.closed_unsuccessful.he;
    plan.status_en = PLAN_STATUS.closed_unsuccessful.en;
    plan.closed_at = now;
    plan.closed_reason = reason;
    plan.updated_at = now;

    plan.history.push({
      id: this._nextHistoryId(),
      type: 'closed_unsuccessful',
      at: now,
      by: plan.csm,
      previous_status: prevStatus,
      reason,
      goal_count: plan.goals.length,
      decisions_count: plan.decisions.length,
      history_count: plan.history.length,
      note_he: 'התכנית נסגרה ללא הצלחה',
      note_en: 'plan closed unsuccessfully',
    });

    return clone(plan);
  }
}

module.exports = {
  SuccessPlan,
  GOAL_STATUS,
  PLAN_STATUS,
  HEALTH_LABELS,
  SEVERITY,
  CADENCE,
  STAKEHOLDER_TYPES,
  RENEWAL_LABELS,
  RISK_BANDS,
  ESCALATION_LEVELS,
  REVIEW_CADENCES,
};
