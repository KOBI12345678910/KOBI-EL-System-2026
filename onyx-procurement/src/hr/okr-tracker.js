/**
 * OKR / KPI Tracker — Cascading Objectives & Key Results
 * Agent Y-066 • Techno-Kol Uzi • Kobi's mega-ERP • 2026-04-11
 *
 * Zero-dependency OKR engine inspired by Google's OKR methodology
 * (Grove → Doerr → Google) adapted for an Israeli construction /
 * procurement organisation.
 *
 * Principles:
 *   - "לא מוחקים רק משדרגים ומגדלים" — NEVER delete. Obsolete
 *     objectives are archived with status='archived' so history is
 *     preserved for retros and audit trails.
 *   - Stretch goals — 70% achievement is considered "good". 100% on
 *     every KR means the targets were too conservative (Google rule).
 *   - Cascading alignment — every objective may declare a parent at a
 *     higher org level (individual → team → department → company).
 *   - Transparency — anyone can read anyone's OKRs. Progress updates
 *     are append-only (history log).
 *   - Bilingual — every user-facing label is { he, en }.
 *
 * Exported:
 *   class OKRTracker
 *     createObjective(spec)
 *     addKeyResult(spec)
 *     updateKR({krId, value, date, note, author})
 *     krProgress(krId)           — 0.0 .. 1.0
 *     objectiveScore(objectiveId)— weighted avg of KRs, 0.0 .. 1.0
 *     cascadeCheck(objectiveId)  — are children aligned with parent?
 *     alignment(employeeId)      — full up-chain for an employee
 *     grading(period)            — color-coded report: red/yellow/green
 *     stretchGoals(objectiveId)  — stretch interpretation (0.7 == good)
 *     dashboardData(orgLevel)    — aggregated view per level
 *     weeklyCheckIn(objectiveId, status, blockers)
 *     retrospective(periodId)    — end-of-period review dataset
 *     archive(objectiveId, reason) — soft-delete (upgrade-only)
 *
 *   Constants / helpers:
 *     LEVELS, KR_TYPES, STATUS, GRADE_COLORS, LABELS
 *     isRed(score), isYellow(score), isGreen(score)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Org hierarchy — top → bottom. Child must be strictly lower than parent. */
const LEVELS = Object.freeze({
  COMPANY: 'company',
  DEPARTMENT: 'department',
  TEAM: 'team',
  INDIVIDUAL: 'individual',
});

const LEVEL_RANK = Object.freeze({
  company: 0,
  department: 1,
  team: 2,
  individual: 3,
});

const KR_TYPES = Object.freeze({
  NUMERIC: 'numeric',
  PERCENT: 'percent',
  BOOLEAN: 'boolean',
  CURRENCY: 'currency',
});

const STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  AT_RISK: 'at_risk',
  ON_TRACK: 'on_track',
  ACHIEVED: 'achieved',
  MISSED: 'missed',
  ARCHIVED: 'archived',
});

/**
 * Google-style OKR grading:
 *   0.00 .. 0.30  → RED    (miss — consider pivot or retire KR)
 *   0.30 .. 0.70  → YELLOW (making progress — ok for stretch goals)
 *   0.70 .. 1.00  → GREEN  (on target; 0.70+ is considered "good" for
 *                          stretch goals; 1.00 suggests target was too low)
 */
const GRADE_COLORS = Object.freeze({
  RED: 'red',
  YELLOW: 'yellow',
  GREEN: 'green',
});

const GRADE_THRESHOLDS = Object.freeze({
  RED_MAX: 0.30,
  YELLOW_MAX: 0.70,
  /** Google "good stretch" marker — 70%+ is a win */
  STRETCH_GOOD: 0.70,
  /** Google "too conservative" marker — hitting 100% suggests you under-set */
  STRETCH_TOO_EASY: 1.00,
});

/** Bilingual labels — every UI string goes through here. */
const LABELS = Object.freeze({
  OBJECTIVE:       { he: 'יעד',                 en: 'Objective' },
  KEY_RESULT:      { he: 'תוצאה מרכזית',         en: 'Key Result' },
  PROGRESS:        { he: 'התקדמות',             en: 'Progress' },
  OWNER:           { he: 'בעלים',               en: 'Owner' },
  PARENT:          { he: 'יעד-אב',              en: 'Parent' },
  ALIGNMENT:       { he: 'התיישרות',            en: 'Alignment' },
  CASCADE:         { he: 'מפל',                 en: 'Cascade' },
  RED:             { he: 'אדום — לא עומד ביעד',  en: 'Red — missed'   },
  YELLOW:          { he: 'צהוב — בהתקדמות',      en: 'Yellow — progressing' },
  GREEN:           { he: 'ירוק — בכיוון',        en: 'Green — on track' },
  STRETCH:         { he: 'יעד מתיחה',           en: 'Stretch goal' },
  STRETCH_GOOD:    { he: 'יעד מתיחה — 70% זה טוב', en: 'Stretch goal — 70% is good' },
  TOO_EASY:        { he: '100% הושג — היעד היה נמוך מדי',  en: '100% achieved — target may have been too low' },
  CHECK_IN:        { he: 'צ\'ק-אין שבועי',       en: 'Weekly check-in' },
  BLOCKER:         { he: 'חסם',                 en: 'Blocker' },
  RETRO:           { he: 'רטרוספקטיבה',          en: 'Retrospective' },
  COMPANY:         { he: 'חברה',                en: 'Company' },
  DEPARTMENT:      { he: 'מחלקה',               en: 'Department' },
  TEAM:            { he: 'צוות',                en: 'Team' },
  INDIVIDUAL:      { he: 'עובד',                en: 'Individual' },
  LEVELS_HE: {
    company:    { he: 'חברה',     en: 'Company' },
    department: { he: 'מחלקה',    en: 'Department' },
    team:       { he: 'צוות',     en: 'Team' },
    individual: { he: 'עובד',     en: 'Individual' },
  },
  STATUS_HE: {
    draft:     { he: 'טיוטה',         en: 'Draft' },
    active:    { he: 'פעיל',          en: 'Active' },
    at_risk:   { he: 'בסיכון',        en: 'At risk' },
    on_track:  { he: 'בכיוון',        en: 'On track' },
    achieved:  { he: 'הושג',          en: 'Achieved' },
    missed:    { he: 'לא הושג',       en: 'Missed' },
    archived:  { he: 'בארכיון',       en: 'Archived' },
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

/** Round to 4 decimals for rates (0.0000 .. 1.0000). */
function round4(n) {
  if (!isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/** Clamp to [0, 1]. */
function clamp01(n) {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Safe divide — 0/0 returns 0 instead of NaN. */
function safeDiv(a, b) {
  if (!b || b === 0) return 0;
  return a / b;
}

/** Parse iso-ish string or Date into Date. */
function parseDate(input) {
  if (!input) return new Date();
  if (input instanceof Date) return input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Freeze a shallow copy so callers can't mutate our state. */
function snap(obj) {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.slice();
  return { ...obj };
}

/** Generate a short id when caller didn't supply one. */
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ═══════════════════════════════════════════════════════════════
// GRADE HELPERS (exported)
// ═══════════════════════════════════════════════════════════════

/** 0.0 .. 0.3 (inclusive of 0, exclusive of 0.3)  → red */
function isRed(score) {
  return score < GRADE_THRESHOLDS.RED_MAX;
}
/** 0.3 .. 0.7 (inclusive of 0.3, exclusive of 0.7) → yellow */
function isYellow(score) {
  return score >= GRADE_THRESHOLDS.RED_MAX && score < GRADE_THRESHOLDS.YELLOW_MAX;
}
/** 0.7 .. 1.0 (inclusive)                          → green */
function isGreen(score) {
  return score >= GRADE_THRESHOLDS.YELLOW_MAX;
}

/** Returns 'red' | 'yellow' | 'green' */
function gradeColor(score) {
  if (isRed(score)) return GRADE_COLORS.RED;
  if (isYellow(score)) return GRADE_COLORS.YELLOW;
  return GRADE_COLORS.GREEN;
}

// ═══════════════════════════════════════════════════════════════
// OKRTracker CLASS
// ═══════════════════════════════════════════════════════════════

class OKRTracker {
  constructor() {
    /** @type {Map<string, object>} */
    this.objectives = new Map();
    /** @type {Map<string, object>} */
    this.keyResults = new Map();
    /** @type {Map<string, object[]>} */
    this.checkIns = new Map();
  }

  // ───────────────────────────────────────────────────────────
  // createObjective
  // ───────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} [spec.id]          auto-generated if omitted
   * @param {string} spec.title_he      Hebrew title (required)
   * @param {string} spec.title_en      English title (required)
   * @param {string} [spec.description]
   * @param {string} spec.owner         employee-id of owner
   * @param {string|null} [spec.parent] parent objective id
   * @param {'company'|'department'|'team'|'individual'} spec.level
   * @param {string} spec.period        e.g. '2026-Q2'
   * @param {object} [spec.alignment]   free-form alignment metadata
   */
  createObjective(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('createObjective: spec object is required');
    }
    if (!spec.title_he || !spec.title_en) {
      throw new Error('createObjective: title_he and title_en are required (bilingual)');
    }
    if (!spec.owner) {
      throw new Error('createObjective: owner employee-id is required');
    }
    if (!spec.level || !(spec.level in LEVEL_RANK)) {
      throw new Error(`createObjective: level must be one of ${Object.values(LEVELS).join(', ')}`);
    }
    if (!spec.period) {
      throw new Error('createObjective: period is required (e.g. "2026-Q2")');
    }

    // Cascade rule: parent must exist AND be at a strictly higher level
    if (spec.parent) {
      const parent = this.objectives.get(spec.parent);
      if (!parent) {
        throw new Error(`createObjective: parent "${spec.parent}" not found`);
      }
      if (LEVEL_RANK[parent.level] >= LEVEL_RANK[spec.level]) {
        throw new Error(
          `createObjective: parent level "${parent.level}" is not higher than child level "${spec.level}"`
        );
      }
    }

    const id = spec.id || genId('obj');
    if (this.objectives.has(id)) {
      throw new Error(`createObjective: id "${id}" already exists`);
    }

    const obj = {
      id,
      title_he:    String(spec.title_he),
      title_en:    String(spec.title_en),
      description: spec.description ? String(spec.description) : '',
      owner:       String(spec.owner),
      parent:      spec.parent || null,
      level:       spec.level,
      period:      String(spec.period),
      alignment:   spec.alignment ? { ...spec.alignment } : {},
      status:      STATUS.ACTIVE,
      krIds:       [],
      createdAt:   parseDate(spec.createdAt).toISOString(),
      archivedAt:  null,
      archiveReason: null,
    };
    this.objectives.set(id, obj);
    return snap(obj);
  }

  // ───────────────────────────────────────────────────────────
  // addKeyResult
  // ───────────────────────────────────────────────────────────
  /**
   * @param {object} spec
   * @param {string} spec.objectiveId
   * @param {string} [spec.id]
   * @param {string} spec.title_he
   * @param {string} spec.title_en
   * @param {string} [spec.metric]  e.g. "% on-time", "ILS"
   * @param {'numeric'|'percent'|'boolean'|'currency'} spec.type
   * @param {number|boolean} spec.start
   * @param {number|boolean} spec.target
   * @param {number|boolean} [spec.current]  defaults to start
   * @param {number}         [spec.weight]   contribution to objective score, default 1
   */
  addKeyResult(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('addKeyResult: spec object is required');
    }
    const obj = this.objectives.get(spec.objectiveId);
    if (!obj) {
      throw new Error(`addKeyResult: objective "${spec.objectiveId}" not found`);
    }
    if (obj.status === STATUS.ARCHIVED) {
      throw new Error(`addKeyResult: cannot add KR to archived objective "${obj.id}"`);
    }
    if (!spec.title_he || !spec.title_en) {
      throw new Error('addKeyResult: title_he and title_en are required (bilingual)');
    }
    if (!spec.type || !Object.values(KR_TYPES).includes(spec.type)) {
      throw new Error(`addKeyResult: type must be one of ${Object.values(KR_TYPES).join(', ')}`);
    }

    // Validate start/target shape per type
    if (spec.type === KR_TYPES.BOOLEAN) {
      if (typeof spec.target !== 'boolean') {
        throw new Error('addKeyResult: boolean KR requires boolean target');
      }
    } else {
      if (typeof spec.start !== 'number' || typeof spec.target !== 'number') {
        throw new Error(`addKeyResult: ${spec.type} KR requires numeric start and target`);
      }
      if (spec.start === spec.target) {
        throw new Error('addKeyResult: start and target must differ (otherwise progress is undefined)');
      }
    }

    const id = spec.id || genId('kr');
    if (this.keyResults.has(id)) {
      throw new Error(`addKeyResult: id "${id}" already exists`);
    }

    const kr = {
      id,
      objectiveId: obj.id,
      title_he:    String(spec.title_he),
      title_en:    String(spec.title_en),
      metric:      spec.metric ? String(spec.metric) : '',
      type:        spec.type,
      start:       spec.start,
      target:      spec.target,
      current:     (spec.current === undefined || spec.current === null) ? spec.start : spec.current,
      weight:      (typeof spec.weight === 'number' && spec.weight > 0) ? spec.weight : 1,
      history:     [{
        value: (spec.current === undefined || spec.current === null) ? spec.start : spec.current,
        date:  parseDate(spec.createdAt).toISOString(),
        note:  'initial',
        author: obj.owner,
      }],
      createdAt: parseDate(spec.createdAt).toISOString(),
    };
    this.keyResults.set(id, kr);
    obj.krIds.push(id);
    return snap(kr);
  }

  // ───────────────────────────────────────────────────────────
  // updateKR — append-only progress update
  // ───────────────────────────────────────────────────────────
  /**
   * @param {object} upd
   * @param {string} upd.krId
   * @param {number|boolean} upd.value
   * @param {string|Date} [upd.date]
   * @param {string}      [upd.note]
   * @param {string}      [upd.author]
   */
  updateKR(upd) {
    if (!upd || typeof upd !== 'object') {
      throw new Error('updateKR: update object is required');
    }
    const kr = this.keyResults.get(upd.krId);
    if (!kr) throw new Error(`updateKR: krId "${upd.krId}" not found`);

    if (kr.type === KR_TYPES.BOOLEAN) {
      if (typeof upd.value !== 'boolean') {
        throw new Error('updateKR: boolean KR requires boolean value');
      }
    } else {
      if (typeof upd.value !== 'number') {
        throw new Error(`updateKR: ${kr.type} KR requires numeric value`);
      }
    }

    const entry = {
      value: upd.value,
      date:  parseDate(upd.date).toISOString(),
      note:  upd.note ? String(upd.note) : '',
      author: upd.author ? String(upd.author) : (this.objectives.get(kr.objectiveId).owner),
    };
    kr.history.push(entry);
    kr.current = upd.value;

    // Auto-update parent objective status based on new score
    const obj = this.objectives.get(kr.objectiveId);
    if (obj && obj.status !== STATUS.ARCHIVED) {
      const score = this.objectiveScore(obj.id);
      if (isGreen(score)) {
        obj.status = STATUS.ON_TRACK;
      } else if (isYellow(score)) {
        obj.status = STATUS.AT_RISK;
      } else {
        obj.status = STATUS.AT_RISK;
      }
    }

    return snap(kr);
  }

  // ───────────────────────────────────────────────────────────
  // krProgress — compute % to goal
  // ───────────────────────────────────────────────────────────
  /**
   * Returns a normalized 0.0 .. 1.0 progress score.
   *   boolean: 1.0 if current === target, else 0.0
   *   numeric/percent/currency:
   *      progress = (current - start) / (target - start), clamped [0,1]
   *   Handles inverse goals (target < start) — e.g. "reduce defects".
   */
  krProgress(krId) {
    const kr = this.keyResults.get(krId);
    if (!kr) throw new Error(`krProgress: krId "${krId}" not found`);

    if (kr.type === KR_TYPES.BOOLEAN) {
      return kr.current === kr.target ? 1.0 : 0.0;
    }

    const num = Number(kr.current) - Number(kr.start);
    const den = Number(kr.target) - Number(kr.start);
    const raw = safeDiv(num, den);
    return round4(clamp01(raw));
  }

  // ───────────────────────────────────────────────────────────
  // objectiveScore — weighted mean of KR progresses
  // ───────────────────────────────────────────────────────────
  objectiveScore(objectiveId) {
    const obj = this.objectives.get(objectiveId);
    if (!obj) throw new Error(`objectiveScore: objectiveId "${objectiveId}" not found`);
    if (obj.krIds.length === 0) return 0;

    let weightedSum = 0;
    let weightTotal = 0;
    for (const krId of obj.krIds) {
      const kr = this.keyResults.get(krId);
      if (!kr) continue;
      const p = this.krProgress(krId);
      weightedSum += p * kr.weight;
      weightTotal += kr.weight;
    }
    return round4(safeDiv(weightedSum, weightTotal));
  }

  // ───────────────────────────────────────────────────────────
  // cascadeCheck — are my children aligned with me?
  // ───────────────────────────────────────────────────────────
  /**
   * Returns an alignment report for this objective and its direct children:
   *   {
   *     objectiveId,
   *     level,
   *     childCount,
   *     alignedCount,      // children with parent=this AND same period
   *     misaligned: [      // children that reference this parent but mismatch
   *        {id, reason: 'wrong_period'|'wrong_level'|'orphan'}
   *     ],
   *     aligned: boolean   // true if all direct children are aligned
   *   }
   */
  cascadeCheck(objectiveId) {
    const parent = this.objectives.get(objectiveId);
    if (!parent) throw new Error(`cascadeCheck: objectiveId "${objectiveId}" not found`);

    const report = {
      objectiveId,
      level: parent.level,
      period: parent.period,
      childCount: 0,
      alignedCount: 0,
      misaligned: [],
      aligned: true,
    };

    for (const child of this.objectives.values()) {
      if (child.parent !== parent.id) continue;
      if (child.status === STATUS.ARCHIVED) continue;
      report.childCount++;

      // rule 1: child level must be strictly lower than parent
      if (LEVEL_RANK[child.level] <= LEVEL_RANK[parent.level]) {
        report.misaligned.push({ id: child.id, reason: 'wrong_level' });
        report.aligned = false;
        continue;
      }
      // rule 2: child period must match (we don't force it, but we flag it)
      if (child.period !== parent.period) {
        report.misaligned.push({ id: child.id, reason: 'wrong_period' });
        report.aligned = false;
        continue;
      }
      report.alignedCount++;
    }

    if (report.childCount === 0) {
      // leaf objective — trivially aligned
      report.aligned = true;
    }

    return report;
  }

  // ───────────────────────────────────────────────────────────
  // alignment — up-chain for an employee
  // ───────────────────────────────────────────────────────────
  /**
   * Walks from each of the employee's objectives up to the top-level
   * company goal and returns the alignment chain.
   */
  alignment(employeeId) {
    if (!employeeId) throw new Error('alignment: employeeId is required');
    const own = [];
    for (const obj of this.objectives.values()) {
      if (obj.owner === employeeId && obj.status !== STATUS.ARCHIVED) {
        own.push(obj);
      }
    }

    const chains = own.map((obj) => {
      const chain = [];
      let cur = obj;
      // walk up, max 10 hops to avoid cycles
      for (let i = 0; i < 10 && cur; i++) {
        chain.push({
          id: cur.id,
          level: cur.level,
          owner: cur.owner,
          title_he: cur.title_he,
          title_en: cur.title_en,
          score: this.objectiveScore(cur.id),
          color: gradeColor(this.objectiveScore(cur.id)),
        });
        cur = cur.parent ? this.objectives.get(cur.parent) : null;
      }
      return {
        objectiveId: obj.id,
        chain,
        aligned: chain[chain.length - 1]?.level === LEVELS.COMPANY,
      };
    });

    return {
      employeeId,
      objectiveCount: own.length,
      chains,
      fullyAligned: chains.length > 0 && chains.every((c) => c.aligned),
    };
  }

  // ───────────────────────────────────────────────────────────
  // grading — color-coded report for a period
  // ───────────────────────────────────────────────────────────
  /**
   * Google-style traffic-light grading:
   *   red    [0.0, 0.3)
   *   yellow [0.3, 0.7)
   *   green  [0.7, 1.0]
   *
   * Returns:
   *   {
   *     period,
   *     total,
   *     counts: {red, yellow, green},
   *     items:  [{id, title_he, title_en, score, color, label}]
   *   }
   */
  grading(period) {
    if (!period) throw new Error('grading: period is required');

    const items = [];
    const counts = { red: 0, yellow: 0, green: 0 };

    for (const obj of this.objectives.values()) {
      if (obj.period !== period) continue;
      if (obj.status === STATUS.ARCHIVED) continue;
      const score = this.objectiveScore(obj.id);
      const color = gradeColor(score);
      counts[color]++;
      items.push({
        id: obj.id,
        title_he: obj.title_he,
        title_en: obj.title_en,
        level:    obj.level,
        owner:    obj.owner,
        score,
        color,
        label: LABELS[color.toUpperCase()],
      });
    }

    items.sort((a, b) => b.score - a.score);

    return {
      period,
      total: items.length,
      counts,
      items,
    };
  }

  // ───────────────────────────────────────────────────────────
  // stretchGoals — Google "70% is good" interpretation
  // ───────────────────────────────────────────────────────────
  stretchGoals(objectiveId) {
    const obj = this.objectives.get(objectiveId);
    if (!obj) throw new Error(`stretchGoals: objectiveId "${objectiveId}" not found`);

    const score = this.objectiveScore(objectiveId);
    const krs = obj.krIds.map((krId) => {
      const kr = this.keyResults.get(krId);
      const p = this.krProgress(krId);
      return {
        id: kr.id,
        title_he: kr.title_he,
        title_en: kr.title_en,
        progress: p,
        stretchMet: p >= GRADE_THRESHOLDS.STRETCH_GOOD,
        tooEasy: p >= GRADE_THRESHOLDS.STRETCH_TOO_EASY,
      };
    });

    return {
      objectiveId,
      score,
      color: gradeColor(score),
      stretchThreshold: GRADE_THRESHOLDS.STRETCH_GOOD,
      stretchMet: score >= GRADE_THRESHOLDS.STRETCH_GOOD,
      tooEasy: score >= GRADE_THRESHOLDS.STRETCH_TOO_EASY,
      interpretation: score >= GRADE_THRESHOLDS.STRETCH_TOO_EASY
        ? LABELS.TOO_EASY
        : score >= GRADE_THRESHOLDS.STRETCH_GOOD
          ? LABELS.STRETCH_GOOD
          : LABELS[gradeColor(score).toUpperCase()],
      krs,
    };
  }

  // ───────────────────────────────────────────────────────────
  // dashboardData — aggregated view per org level
  // ───────────────────────────────────────────────────────────
  dashboardData(orgLevel) {
    if (orgLevel && !(orgLevel in LEVEL_RANK)) {
      throw new Error(`dashboardData: orgLevel must be one of ${Object.values(LEVELS).join(', ')}`);
    }

    const byLevel = { company: [], department: [], team: [], individual: [] };
    const overall = { red: 0, yellow: 0, green: 0, total: 0, sumScore: 0 };

    for (const obj of this.objectives.values()) {
      if (obj.status === STATUS.ARCHIVED) continue;
      if (orgLevel && obj.level !== orgLevel) continue;

      const score = this.objectiveScore(obj.id);
      const color = gradeColor(score);
      const item = {
        id: obj.id,
        title_he: obj.title_he,
        title_en: obj.title_en,
        owner:    obj.owner,
        level:    obj.level,
        period:   obj.period,
        score,
        color,
        krCount:  obj.krIds.length,
      };
      byLevel[obj.level].push(item);
      overall[color]++;
      overall.total++;
      overall.sumScore += score;
    }

    return {
      orgLevel: orgLevel || 'all',
      byLevel,
      overall: {
        ...overall,
        avgScore: round4(safeDiv(overall.sumScore, overall.total)),
        color:    overall.total > 0 ? gradeColor(overall.sumScore / overall.total) : null,
      },
    };
  }

  // ───────────────────────────────────────────────────────────
  // weeklyCheckIn — append-only weekly ritual
  // ───────────────────────────────────────────────────────────
  /**
   * @param {string} objectiveId
   * @param {'on_track'|'at_risk'|'achieved'|'missed'} status
   * @param {string[]} [blockers]
   * @param {string}   [note]
   * @param {string}   [author]
   * @param {string|Date} [date]
   */
  weeklyCheckIn(objectiveId, status, blockers, note, author, date) {
    const obj = this.objectives.get(objectiveId);
    if (!obj) throw new Error(`weeklyCheckIn: objectiveId "${objectiveId}" not found`);
    if (obj.status === STATUS.ARCHIVED) {
      throw new Error(`weeklyCheckIn: cannot check in on archived objective "${objectiveId}"`);
    }
    const validStatus = [STATUS.ON_TRACK, STATUS.AT_RISK, STATUS.ACHIEVED, STATUS.MISSED];
    if (!validStatus.includes(status)) {
      throw new Error(`weeklyCheckIn: status must be one of ${validStatus.join(', ')}`);
    }

    const entry = {
      objectiveId,
      status,
      blockers: Array.isArray(blockers) ? blockers.slice() : [],
      note:     note ? String(note) : '',
      author:   author || obj.owner,
      date:     parseDate(date).toISOString(),
      score:    this.objectiveScore(objectiveId),
      color:    gradeColor(this.objectiveScore(objectiveId)),
    };

    if (!this.checkIns.has(objectiveId)) this.checkIns.set(objectiveId, []);
    this.checkIns.get(objectiveId).push(entry);

    // Update live status on the objective
    obj.status = status;
    return snap(entry);
  }

  // ───────────────────────────────────────────────────────────
  // retrospective — end-of-period review data
  // ───────────────────────────────────────────────────────────
  retrospective(periodId) {
    if (!periodId) throw new Error('retrospective: periodId is required');

    const objectives = [];
    for (const obj of this.objectives.values()) {
      if (obj.period !== periodId) continue;
      if (obj.status === STATUS.ARCHIVED) continue;

      const score = this.objectiveScore(obj.id);
      const checkIns = this.checkIns.get(obj.id) || [];
      const krs = obj.krIds.map((krId) => {
        const kr = this.keyResults.get(krId);
        return {
          id: kr.id,
          title_he: kr.title_he,
          title_en: kr.title_en,
          start: kr.start,
          target: kr.target,
          final: kr.current,
          progress: this.krProgress(krId),
          updates: kr.history.length - 1, // minus the 'initial' entry
        };
      });

      const blockers = checkIns.flatMap((c) => c.blockers);

      objectives.push({
        id: obj.id,
        title_he: obj.title_he,
        title_en: obj.title_en,
        owner:    obj.owner,
        level:    obj.level,
        finalScore: score,
        color:    gradeColor(score),
        stretchMet: score >= GRADE_THRESHOLDS.STRETCH_GOOD,
        checkInCount: checkIns.length,
        blockers,
        krs,
        // Retrospective prompts (bilingual)
        prompts: {
          whatWorked:   { he: 'מה עבד טוב?',        en: 'What worked well?' },
          whatDidnt:    { he: 'מה לא עבד?',         en: 'What didn\'t work?' },
          learnings:    { he: 'מה למדנו?',          en: 'What did we learn?' },
          actionItems:  { he: 'מה נעשה אחרת?',      en: 'What will we change?' },
        },
      });
    }

    const counts = { red: 0, yellow: 0, green: 0 };
    for (const o of objectives) counts[o.color]++;

    return {
      periodId,
      objectiveCount: objectives.length,
      counts,
      stretchSuccessRate: round4(
        safeDiv(objectives.filter((o) => o.stretchMet).length, objectives.length)
      ),
      avgScore: round4(
        safeDiv(objectives.reduce((s, o) => s + o.finalScore, 0), objectives.length)
      ),
      objectives,
    };
  }

  // ───────────────────────────────────────────────────────────
  // archive — soft-delete (upgrade-only principle)
  // "לא מוחקים רק משדרגים ומגדלים" — never truly delete, just archive
  // ───────────────────────────────────────────────────────────
  archive(objectiveId, reason) {
    const obj = this.objectives.get(objectiveId);
    if (!obj) throw new Error(`archive: objectiveId "${objectiveId}" not found`);
    obj.status = STATUS.ARCHIVED;
    obj.archivedAt = new Date().toISOString();
    obj.archiveReason = reason ? String(reason) : '';
    return snap(obj);
  }

  // ───────────────────────────────────────────────────────────
  // read helpers (non-mutating)
  // ───────────────────────────────────────────────────────────
  getObjective(id) { return snap(this.objectives.get(id)); }
  getKR(id)        { return snap(this.keyResults.get(id)); }
  listObjectives(filter) {
    const out = [];
    for (const o of this.objectives.values()) {
      if (filter) {
        if (filter.period && o.period !== filter.period) continue;
        if (filter.level && o.level !== filter.level) continue;
        if (filter.owner && o.owner !== filter.owner) continue;
        if (filter.status && o.status !== filter.status) continue;
        if (filter.includeArchived !== true && o.status === STATUS.ARCHIVED) continue;
      } else if (o.status === STATUS.ARCHIVED) {
        continue;
      }
      out.push(snap(o));
    }
    return out;
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  OKRTracker,
  LEVELS,
  LEVEL_RANK,
  KR_TYPES,
  STATUS,
  GRADE_COLORS,
  GRADE_THRESHOLDS,
  LABELS,
  isRed,
  isYellow,
  isGreen,
  gradeColor,
};
