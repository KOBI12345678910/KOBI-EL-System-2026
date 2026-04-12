/**
 * Sales Playbook Engine  |  מנוע תסריטי מכירות
 * =============================================================
 *
 * Agent Y-027  |  Techno-Kol Uzi mega-ERP
 * Date: 2026-04-11
 *
 * Situation-based sales playbook engine. Sales reps have a set
 * of pre-defined playbooks (scripts / cadences) that fire on
 * triggers — new lead, stage change, deal stuck, competitor
 * detected, objection raised, renewal window, etc. Each playbook
 * walks an opportunity through a sequence of steps (call, email,
 * meeting, demo, task), each with a suggested wait and due date.
 *
 * Zero dependencies. In-memory, deterministic, append-only.
 * Bilingual (Hebrew + English) on every playbook, step, trigger
 * and label.
 *
 * -------------------------------------------------------------
 * HARD RULE: NEVER DELETE — only upgrade / grow
 * לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 *
 *   - Playbooks are versioned: re-defining an id bumps version,
 *     previous revisions stay readable via getPlaybookHistory().
 *   - Executions are append-only. `completeStep`, `skipStep`,
 *     and `cancelExecution` all keep the full history — a step
 *     is never removed from `steps_state[]`.
 *   - Skipped steps are LOGGED (with reason), not deleted.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Playbook {
 *     id, version, name_he, name_en,
 *     trigger: { type, params },
 *     steps: [
 *       { id, type, content_he, content_en, waitDays, dueDays }
 *     ],
 *     created_at, updated_at
 *   }
 *
 *   Execution {
 *     id, playbook_id, playbook_version, opportunity_id,
 *     trigger_event, trigger_context,
 *     status: 'active' | 'completed' | 'cancelled',
 *     current_step_index,
 *     steps_state: [
 *       { step_id, status, started_at, completed_at, outcome,
 *         skipped, skip_reason, due_at }
 *     ],
 *     started_at, completed_at?, cancelled_at?
 *   }
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *
 *   definePlaybook({id, name_he, name_en, trigger, steps})  → Playbook
 *   getPlaybook(id, version?)                               → Playbook
 *   getPlaybookHistory(id)                                  → Playbook[]
 *   listPlaybooks()                                         → Playbook[]
 *
 *   trigger(event, context)                                 → Execution[]
 *   getExecution(executionId)                               → Execution
 *   listExecutions(filter?)                                 → Execution[]
 *   getCurrentStep(executionId)                             → StepView
 *   completeStep(executionId, stepId, outcome)              → Execution
 *   skipStep(executionId, stepId, reason)                   → Execution
 *   cancelExecution(executionId, reason)                    → Execution
 *
 *   metrics(playbookId, period)                             → MetricsReport
 *
 * -------------------------------------------------------------
 * TRIGGERS
 * -------------------------------------------------------------
 *
 *   new-lead                   — inbound lead created
 *   stage-change               — deal moved between stages
 *   stuck-in-stage-X-days      — deal idle > X days in stage
 *   competitor-detected        — competitor surfaced on a deal
 *   objection-raised           — sales rep logged an objection
 *   deal-slipping              — close date pushed twice / probability falling
 *
 * Triggers match by `type` + optional `params` (e.g. stage name,
 * X days threshold, competitor name, objection category).
 *
 * =============================================================
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Trigger catalog (bilingual)
// ─────────────────────────────────────────────────────────────

const TRIGGER_TYPES = Object.freeze({
  'new-lead': {
    he: 'ליד חדש',
    en: 'New lead',
    params: ['source', 'channel'],
  },
  'stage-change': {
    he: 'שינוי שלב',
    en: 'Stage change',
    params: ['fromStage', 'toStage'],
  },
  'stuck-in-stage-X-days': {
    he: 'תקוע בשלב X ימים',
    en: 'Stuck in stage X days',
    params: ['stage', 'days'],
  },
  'competitor-detected': {
    he: 'מתחרה זוהה',
    en: 'Competitor detected',
    params: ['competitor'],
  },
  'objection-raised': {
    he: 'התנגדות הועלתה',
    en: 'Objection raised',
    params: ['category'],
  },
  'deal-slipping': {
    he: 'עסקה נשמטת',
    en: 'Deal slipping',
    params: ['reason'],
  },
});

// ─────────────────────────────────────────────────────────────
// Step type catalog (bilingual)
// ─────────────────────────────────────────────────────────────

const STEP_TYPES = Object.freeze({
  call:    { he: 'שיחת טלפון', en: 'Phone call' },
  email:   { he: 'אימייל',      en: 'Email' },
  meeting: { he: 'פגישה',       en: 'Meeting' },
  demo:    { he: 'הדגמה',       en: 'Demo' },
  task:    { he: 'משימה',       en: 'Task' },
});

// ─────────────────────────────────────────────────────────────
// Outcome / status labels
// ─────────────────────────────────────────────────────────────

const LABELS = Object.freeze({
  stepPending:     { he: 'ממתין',        en: 'pending' },
  stepActive:      { he: 'בתהליך',       en: 'active' },
  stepDone:        { he: 'הושלם',        en: 'completed' },
  stepSkipped:     { he: 'דולג',         en: 'skipped' },
  execActive:      { he: 'פעיל',         en: 'active' },
  execCompleted:   { he: 'הושלם',        en: 'completed' },
  execCancelled:   { he: 'בוטל',         en: 'cancelled' },
  notFound:        { he: 'לא נמצא',      en: 'not found' },
  invalidTrigger:  { he: 'טריגר לא חוקי', en: 'invalid trigger' },
  invalidStepType: { he: 'סוג צעד לא חוקי', en: 'invalid step type' },
});

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function _now() {
  // Isolated seam so tests can stub if needed.
  return new Date();
}

function _iso(d) {
  return (d instanceof Date ? d : new Date(d)).toISOString();
}

function _addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d;
}

function _daysBetween(a, b) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (24 * 60 * 60 * 1000);
}

function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.getOwnPropertyNames(obj).forEach((k) => _deepFreeze(obj[k]));
  return Object.freeze(obj);
}

function _assert(cond, msgHe, msgEn) {
  if (!cond) {
    const err = new Error(`${msgEn} | ${msgHe}`);
    err.bilingual = { he: msgHe, en: msgEn };
    throw err;
  }
}

function _clone(obj) {
  // Zero-dep deep clone — only JSON-safe shapes flow through here.
  return JSON.parse(JSON.stringify(obj));
}

// ─────────────────────────────────────────────────────────────
// Main class
// ─────────────────────────────────────────────────────────────

class SalesPlaybook {
  constructor(options = {}) {
    /** @type {Map<string, Array<object>>} id → version history */
    this._playbooks = new Map();
    /** @type {Map<string, object>} executionId → execution */
    this._executions = new Map();

    this._seq = { exec: 0, step: 0 };
    this._seedIfRequested(options);
  }

  // ────────────────────────────────────────────────────
  //  DEFINITION
  // ────────────────────────────────────────────────────

  /**
   * Define (or upgrade) a playbook. If the id already exists the
   * previous revision is preserved in history and a new version is
   * appended — nothing is ever removed.
   */
  definePlaybook(def) {
    _assert(def && typeof def === 'object',
      'הגדרה חייבת להיות אובייקט', 'definition must be an object');
    _assert(typeof def.id === 'string' && def.id.length > 0,
      'חסר מזהה', 'id is required');
    _assert(typeof def.name_he === 'string' && def.name_he.length > 0,
      'חסר שם עברי', 'name_he is required');
    _assert(typeof def.name_en === 'string' && def.name_en.length > 0,
      'missing name_en', 'name_en is required');
    _assert(def.trigger && typeof def.trigger === 'object',
      'חסר טריגר', 'trigger is required');
    _assert(typeof def.trigger.type === 'string' && TRIGGER_TYPES[def.trigger.type],
      'טריגר לא חוקי', `invalid trigger type: ${def.trigger.type}`);
    _assert(Array.isArray(def.steps) && def.steps.length > 0,
      'חייב לכלול צעדים', 'steps array is required');

    const steps = def.steps.map((s, i) => {
      _assert(typeof s.id === 'string' && s.id.length > 0,
        `צעד ${i} חסר מזהה`, `step ${i} missing id`);
      _assert(STEP_TYPES[s.type],
        `סוג צעד לא חוקי ${s.type}`, `invalid step type: ${s.type}`);
      _assert(typeof s.content_he === 'string' && s.content_he.length > 0,
        `צעד ${s.id} חסר תוכן עברי`, `step ${s.id} missing content_he`);
      _assert(typeof s.content_en === 'string' && s.content_en.length > 0,
        `step ${s.id} missing content_en`, `step ${s.id} missing content_en`);
      return {
        id: s.id,
        type: s.type,
        content_he: s.content_he,
        content_en: s.content_en,
        waitDays: Number(s.waitDays || 0),
        dueDays:  Number(s.dueDays  || 0),
        order: i,
      };
    });

    const history = this._playbooks.get(def.id) || [];
    const version = history.length + 1;
    const now = _now();

    const playbook = {
      id: def.id,
      version,
      name_he: def.name_he,
      name_en: def.name_en,
      trigger: {
        type: def.trigger.type,
        params: def.trigger.params ? _clone(def.trigger.params) : {},
      },
      steps,
      created_at: _iso(now),
      updated_at: _iso(now),
    };

    history.push(playbook);
    this._playbooks.set(def.id, history);
    return _clone(playbook);
  }

  /** Latest version of a playbook, or a specific version if passed. */
  getPlaybook(id, version) {
    const history = this._playbooks.get(id);
    if (!history || history.length === 0) return null;
    if (version == null) return _clone(history[history.length - 1]);
    const pb = history.find((p) => p.version === version);
    return pb ? _clone(pb) : null;
  }

  getPlaybookHistory(id) {
    const history = this._playbooks.get(id);
    if (!history) return [];
    return history.map(_clone);
  }

  listPlaybooks() {
    const out = [];
    for (const history of this._playbooks.values()) {
      if (history.length > 0) out.push(_clone(history[history.length - 1]));
    }
    return out;
  }

  // ────────────────────────────────────────────────────
  //  TRIGGER MATCHING
  // ────────────────────────────────────────────────────

  /**
   * Fires all matching playbooks for a given event + context.
   * Returns an array of newly-created executions.
   *
   * Matching rules:
   *   - Event type must equal playbook trigger type.
   *   - If the playbook defines trigger params, each param must
   *     equal / satisfy the context:
   *       * strings are compared case-insensitively
   *       * numeric `days` acts as a lower-bound threshold
   *         (context.days >= playbook.days)
   *       * `fromStage`/`toStage` allow '*' wildcard
   *       * unspecified params match anything.
   */
  trigger(event, context = {}) {
    _assert(typeof event === 'string' && TRIGGER_TYPES[event],
      `טריגר לא חוקי ${event}`, `invalid trigger event: ${event}`);
    const matches = [];
    for (const history of this._playbooks.values()) {
      if (!history || history.length === 0) continue;
      const pb = history[history.length - 1];
      if (pb.trigger.type !== event) continue;
      if (!this._paramsMatch(pb.trigger.params, context)) continue;
      matches.push(pb);
    }

    const created = [];
    for (const pb of matches) {
      const exec = this._startExecution(pb, event, context);
      created.push(_clone(exec));
    }
    return created;
  }

  _paramsMatch(expected, actual) {
    if (!expected || Object.keys(expected).length === 0) return true;
    if (!actual || typeof actual !== 'object') return false;
    for (const [key, want] of Object.entries(expected)) {
      const got = actual[key];
      if (want == null || want === '*') continue;
      if (key === 'days' || key === 'daysThreshold') {
        // numeric threshold
        if (typeof got !== 'number') return false;
        if (got < Number(want)) return false;
        continue;
      }
      if (typeof want === 'string') {
        if (got == null) return false;
        if (String(got).toLowerCase() !== want.toLowerCase()) return false;
        continue;
      }
      if (want !== got) return false;
    }
    return true;
  }

  _startExecution(pb, event, context) {
    const execId = `exec-${++this._seq.exec}`;
    const now = _now();

    // Compute due dates by walking wait-days cumulatively.
    let cursor = new Date(now);
    const stepsState = pb.steps.map((s, i) => {
      if (i === 0) {
        // First step uses its own waitDays (usually 0) from "now"
        cursor = _addDays(cursor, s.waitDays);
      } else {
        cursor = _addDays(cursor, s.waitDays);
      }
      const due = s.dueDays > 0 ? _addDays(cursor, s.dueDays) : cursor;
      return {
        step_id: s.id,
        status: i === 0 ? 'active' : 'pending',
        started_at: i === 0 ? _iso(now) : null,
        completed_at: null,
        outcome: null,
        skipped: false,
        skip_reason: null,
        scheduled_at: _iso(cursor),
        due_at: _iso(due),
      };
    });

    const exec = {
      id: execId,
      playbook_id: pb.id,
      playbook_version: pb.version,
      opportunity_id: context.opportunity_id || context.deal_id || null,
      trigger_event: event,
      trigger_context: _clone(context),
      status: 'active',
      current_step_index: 0,
      steps_state: stepsState,
      started_at: _iso(now),
      completed_at: null,
      cancelled_at: null,
    };
    this._executions.set(execId, exec);
    return exec;
  }

  // ────────────────────────────────────────────────────
  //  STEP PROGRESSION
  // ────────────────────────────────────────────────────

  getExecution(executionId) {
    const e = this._executions.get(executionId);
    return e ? _clone(e) : null;
  }

  listExecutions(filter = {}) {
    const out = [];
    for (const e of this._executions.values()) {
      if (filter.playbook_id && e.playbook_id !== filter.playbook_id) continue;
      if (filter.status && e.status !== filter.status) continue;
      if (filter.opportunity_id && e.opportunity_id !== filter.opportunity_id) continue;
      out.push(_clone(e));
    }
    return out;
  }

  getCurrentStep(executionId) {
    const exec = this._executions.get(executionId);
    _assert(exec, 'ביצוע לא נמצא', `execution not found: ${executionId}`);
    if (exec.status !== 'active') return null;
    const pb = this.getPlaybook(exec.playbook_id, exec.playbook_version);
    const idx = exec.current_step_index;
    if (idx >= pb.steps.length) return null;
    const def = pb.steps[idx];
    const state = exec.steps_state[idx];
    return {
      execution_id: exec.id,
      playbook_id: pb.id,
      step_index: idx,
      step_id: def.id,
      type: def.type,
      type_label_he: STEP_TYPES[def.type].he,
      type_label_en: STEP_TYPES[def.type].en,
      content_he: def.content_he,
      content_en: def.content_en,
      scheduled_at: state.scheduled_at,
      due_at: state.due_at,
      status: state.status,
      waitDays: def.waitDays,
      dueDays: def.dueDays,
    };
  }

  /**
   * Mark a step complete and advance to the next. Outcome is free-form
   * text plus a bilingual `result` field (won|lost|neutral|positive).
   * If there is no next step the execution itself is marked completed.
   * Nothing is ever removed; `steps_state` is strictly append-only.
   */
  completeStep(executionId, stepId, outcome = {}) {
    const exec = this._executions.get(executionId);
    _assert(exec, 'ביצוע לא נמצא', `execution not found: ${executionId}`);
    _assert(exec.status === 'active',
      'הביצוע אינו פעיל', `execution not active: ${exec.status}`);
    const idx = exec.current_step_index;
    const state = exec.steps_state[idx];
    _assert(state && state.step_id === stepId,
      `צעד ${stepId} אינו הצעד הנוכחי`,
      `step ${stepId} is not the current step (current: ${state && state.step_id})`);

    const now = _now();
    state.status = 'completed';
    state.completed_at = _iso(now);
    state.outcome = _clone(outcome || {});

    // Advance
    exec.current_step_index = idx + 1;
    if (exec.current_step_index >= exec.steps_state.length) {
      exec.status = 'completed';
      exec.completed_at = _iso(now);
    } else {
      const nextState = exec.steps_state[exec.current_step_index];
      nextState.status = 'active';
      nextState.started_at = _iso(now);
    }
    return _clone(exec);
  }

  /**
   * Skip the current step. The step is NOT removed — its state flips
   * to `skipped`, the reason is logged, and the execution advances.
   */
  skipStep(executionId, stepId, reason) {
    const exec = this._executions.get(executionId);
    _assert(exec, 'ביצוע לא נמצא', `execution not found: ${executionId}`);
    _assert(exec.status === 'active',
      'הביצוע אינו פעיל', `execution not active: ${exec.status}`);
    _assert(typeof reason === 'string' && reason.length > 0,
      'חסרה סיבת דילוג', 'skip reason is required');
    const idx = exec.current_step_index;
    const state = exec.steps_state[idx];
    _assert(state && state.step_id === stepId,
      `צעד ${stepId} אינו הצעד הנוכחי`,
      `step ${stepId} is not the current step`);

    const now = _now();
    state.status = 'skipped';
    state.skipped = true;
    state.skip_reason = reason;
    state.completed_at = _iso(now);

    exec.current_step_index = idx + 1;
    if (exec.current_step_index >= exec.steps_state.length) {
      exec.status = 'completed';
      exec.completed_at = _iso(now);
    } else {
      const nextState = exec.steps_state[exec.current_step_index];
      nextState.status = 'active';
      nextState.started_at = _iso(now);
    }
    return _clone(exec);
  }

  /** Cancels the whole execution. Kept in the store — never deleted. */
  cancelExecution(executionId, reason) {
    const exec = this._executions.get(executionId);
    _assert(exec, 'ביצוע לא נמצא', `execution not found: ${executionId}`);
    _assert(typeof reason === 'string' && reason.length > 0,
      'חסרה סיבת ביטול', 'cancel reason is required');
    if (exec.status !== 'active') return _clone(exec);
    const now = _now();
    exec.status = 'cancelled';
    exec.cancelled_at = _iso(now);
    exec.cancel_reason = reason;
    return _clone(exec);
  }

  // ────────────────────────────────────────────────────
  //  METRICS / EFFECTIVENESS
  // ────────────────────────────────────────────────────

  /**
   * Aggregate metrics for a playbook over an optional period window.
   * period = { from?: Date|ISO, to?: Date|ISO }
   *
   * Returns:
   *   {
   *     playbook_id, version,
   *     total_executions, active, completed, cancelled,
   *     completion_rate,
   *     steps_completed, steps_skipped, skip_rate,
   *     avg_duration_days,
   *     top_skip_reasons: [{reason, count}],
   *     outcome_breakdown: {won, lost, neutral, positive, other}
   *   }
   */
  metrics(playbookId, period = {}) {
    const pbHistory = this._playbooks.get(playbookId);
    _assert(pbHistory && pbHistory.length > 0,
      'תסריט לא נמצא', `playbook not found: ${playbookId}`);
    const latest = pbHistory[pbHistory.length - 1];

    const from = period.from ? new Date(period.from).getTime() : -Infinity;
    const to   = period.to   ? new Date(period.to).getTime()   :  Infinity;

    let total = 0, active = 0, completed = 0, cancelled = 0;
    let stepsCompleted = 0, stepsSkipped = 0;
    const durations = [];
    const skipReasons = new Map();
    const outcomes = { won: 0, lost: 0, neutral: 0, positive: 0, other: 0 };

    for (const e of this._executions.values()) {
      if (e.playbook_id !== playbookId) continue;
      const startedMs = new Date(e.started_at).getTime();
      if (startedMs < from || startedMs > to) continue;
      total += 1;
      if (e.status === 'active') active += 1;
      if (e.status === 'completed') completed += 1;
      if (e.status === 'cancelled') cancelled += 1;

      if (e.status === 'completed' && e.completed_at) {
        durations.push(_daysBetween(e.started_at, e.completed_at));
      }

      for (const s of e.steps_state) {
        if (s.status === 'completed') stepsCompleted += 1;
        if (s.status === 'skipped') {
          stepsSkipped += 1;
          const r = s.skip_reason || 'unspecified';
          skipReasons.set(r, (skipReasons.get(r) || 0) + 1);
        }
        if (s.outcome && s.outcome.result) {
          const r = String(s.outcome.result).toLowerCase();
          if (outcomes[r] != null) outcomes[r] += 1;
          else outcomes.other += 1;
        }
      }
    }

    const totalSteps = stepsCompleted + stepsSkipped;
    const topSkip = [...skipReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    return {
      playbook_id: playbookId,
      version: latest.version,
      name_he: latest.name_he,
      name_en: latest.name_en,
      period: {
        from: period.from ? _iso(period.from) : null,
        to:   period.to   ? _iso(period.to)   : null,
      },
      total_executions: total,
      active,
      completed,
      cancelled,
      completion_rate: total === 0 ? 0 : +(completed / total).toFixed(4),
      steps_completed: stepsCompleted,
      steps_skipped: stepsSkipped,
      skip_rate: totalSteps === 0 ? 0 : +(stepsSkipped / totalSteps).toFixed(4),
      avg_duration_days: durations.length === 0
        ? 0
        : +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2),
      top_skip_reasons: topSkip,
      outcome_breakdown: outcomes,
    };
  }

  // ────────────────────────────────────────────────────
  //  SEED — 5 default playbooks
  // ────────────────────────────────────────────────────

  _seedIfRequested(options) {
    if (options && options.seed === false) return;
    this.seedDefaults();
  }

  seedDefaults() {
    // Only seed ids that don't already exist (guarded against duplicate
    // constructor invocations + explicit re-seed calls).
    const wanted = buildDefaultPlaybooks();
    for (const def of wanted) {
      if (!this._playbooks.has(def.id)) {
        this.definePlaybook(def);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Default seed playbooks (module-level, exported for inspection)
// ─────────────────────────────────────────────────────────────

function buildDefaultPlaybooks() {
  return [
    // 1. New inbound lead — 5 steps over 10 days
    {
      id: 'pb-new-inbound-lead',
      name_he: 'ליד נכנס חדש',
      name_en: 'New inbound lead',
      trigger: { type: 'new-lead', params: {} },
      steps: [
        {
          id: 'step-1',
          type: 'call',
          content_he: 'שיחת היכרות תוך שעה — בירור צורך וגודל העסק',
          content_en: 'Discovery call within 1 hour — clarify need and company size',
          waitDays: 0,
          dueDays: 0,
        },
        {
          id: 'step-2',
          type: 'email',
          content_he: 'אימייל מעקב עם מצגת וחומר רלוונטי לתחום הלקוח',
          content_en: 'Follow-up email with deck and industry-relevant material',
          waitDays: 1,
          dueDays: 1,
        },
        {
          id: 'step-3',
          type: 'demo',
          content_he: 'הדגמה ממוקדת של המוצר לצורכי הלקוח',
          content_en: 'Targeted product demo aligned to customer needs',
          waitDays: 3,
          dueDays: 2,
        },
        {
          id: 'step-4',
          type: 'meeting',
          content_he: 'פגישת המשך עם מקבל ההחלטה הכלכלית',
          content_en: 'Follow-up meeting with economic decision-maker',
          waitDays: 4,
          dueDays: 2,
        },
        {
          id: 'step-5',
          type: 'task',
          content_he: 'הכנת הצעת מחיר והעברתה תוך 48 שעות',
          content_en: 'Prepare and deliver a proposal within 48 hours',
          waitDays: 2,
          dueDays: 1,
        },
      ],
    },

    // 2. Renewal approach (60 days before)
    {
      id: 'pb-renewal-60d',
      name_he: 'גישה לחידוש 60 יום לפני',
      name_en: 'Renewal approach (60 days before)',
      trigger: {
        type: 'stuck-in-stage-X-days',
        params: { stage: 'Renewal', days: 0 },
      },
      steps: [
        {
          id: 'step-1',
          type: 'email',
          content_he: 'אימייל פתיחה — תזכורת שהמנוי מתחדש בעוד 60 יום',
          content_en: 'Opening email — renewal due in 60 days',
          waitDays: 0,
          dueDays: 1,
        },
        {
          id: 'step-2',
          type: 'call',
          content_he: 'שיחה לסקירת שימוש ותוצאות הלקוח בשנה החולפת',
          content_en: 'Call to review usage and outcomes over the past year',
          waitDays: 7,
          dueDays: 3,
        },
        {
          id: 'step-3',
          type: 'meeting',
          content_he: 'פגישת QBR — הצגת תוצאות, ROI והתאמות לחידוש',
          content_en: 'QBR meeting — present results, ROI, renewal adjustments',
          waitDays: 14,
          dueDays: 5,
        },
        {
          id: 'step-4',
          type: 'task',
          content_he: 'הכנת הצעת חידוש ותיאום מחיר עם הנהלה',
          content_en: 'Prepare renewal proposal and align pricing with management',
          waitDays: 7,
          dueDays: 2,
        },
        {
          id: 'step-5',
          type: 'email',
          content_he: 'שליחת הצעת חידוש רשמית',
          content_en: 'Send formal renewal offer',
          waitDays: 2,
          dueDays: 1,
        },
        {
          id: 'step-6',
          type: 'call',
          content_he: 'שיחת סגירה למסמך החידוש',
          content_en: 'Closing call for the renewal paperwork',
          waitDays: 10,
          dueDays: 3,
        },
      ],
    },

    // 3. Stuck in proposal stage
    {
      id: 'pb-stuck-in-proposal',
      name_he: 'תקוע בשלב הצעת מחיר',
      name_en: 'Stuck in proposal stage',
      trigger: {
        type: 'stuck-in-stage-X-days',
        params: { stage: 'Proposal', days: 7 },
      },
      steps: [
        {
          id: 'step-1',
          type: 'email',
          content_he: 'אימייל עדין — האם ההצעה נבחנת? יש שאלות?',
          content_en: 'Gentle nudge email — is the proposal under review? questions?',
          waitDays: 0,
          dueDays: 1,
        },
        {
          id: 'step-2',
          type: 'call',
          content_he: 'שיחה אקטיבית לבירור התנגדויות וחסמים',
          content_en: 'Active call to surface objections and blockers',
          waitDays: 2,
          dueDays: 2,
        },
        {
          id: 'step-3',
          type: 'task',
          content_he: 'הצעת שדרוג/הטבה נקודתית (תוקף מוגבל)',
          content_en: 'Offer targeted upgrade/incentive (time-bound)',
          waitDays: 3,
          dueDays: 2,
        },
        {
          id: 'step-4',
          type: 'meeting',
          content_he: 'פגישת לחיצת יד עם מקבל ההחלטה',
          content_en: 'Handshake meeting with decision-maker',
          waitDays: 3,
          dueDays: 3,
        },
      ],
    },

    // 4. Lost-to-competitor recovery
    {
      id: 'pb-lost-to-competitor-recovery',
      name_he: 'שחזור מהפסד למתחרה',
      name_en: 'Lost-to-competitor recovery',
      trigger: {
        type: 'competitor-detected',
        params: {},
      },
      steps: [
        {
          id: 'step-1',
          type: 'task',
          content_he: 'תחקור סיבת ההפסד ותיעוד ההבדלים מול המתחרה',
          content_en: 'Root-cause the loss and document differences vs competitor',
          waitDays: 0,
          dueDays: 2,
        },
        {
          id: 'step-2',
          type: 'email',
          content_he: 'אימייל הוגן — תודה, ואנו כאן כשתצטרכו',
          content_en: 'Graceful email — thanks, and we are here when you need us',
          waitDays: 3,
          dueDays: 1,
        },
        {
          id: 'step-3',
          type: 'call',
          content_he: 'שיחה אחרי 30 יום — בדיקת שביעות רצון מהמתחרה',
          content_en: '30-day check-in call — gauge satisfaction with competitor',
          waitDays: 30,
          dueDays: 3,
        },
        {
          id: 'step-4',
          type: 'meeting',
          content_he: 'פגישה אחרי 90 יום עם הצעת חזרה והטבת דייר חוזר',
          content_en: '90-day meeting with win-back offer and returning-customer perk',
          waitDays: 60,
          dueDays: 5,
        },
        {
          id: 'step-5',
          type: 'task',
          content_he: 'מעקב תמיכה — פתרון חסמי מעבר',
          content_en: 'Onboarding support — resolve migration blockers',
          waitDays: 5,
          dueDays: 7,
        },
      ],
    },

    // 5. Upsell to existing customer
    {
      id: 'pb-upsell-existing',
      name_he: 'מכירת שדרוג ללקוח קיים',
      name_en: 'Upsell to existing customer',
      trigger: {
        type: 'stage-change',
        params: { toStage: 'Customer' },
      },
      steps: [
        {
          id: 'step-1',
          type: 'task',
          content_he: 'איסוף נתוני שימוש ואיתור פונקציות שאינן בשימוש מלא',
          content_en: 'Collect usage data and identify under-utilized features',
          waitDays: 0,
          dueDays: 2,
        },
        {
          id: 'step-2',
          type: 'email',
          content_he: 'אימייל עם תובנות שימוש והצעת שדרוג ממוקדת',
          content_en: 'Email with usage insights and targeted upgrade offer',
          waitDays: 3,
          dueDays: 1,
        },
        {
          id: 'step-3',
          type: 'demo',
          content_he: 'הדגמת יכולות מתקדמות שאינן בחבילה הנוכחית',
          content_en: 'Demo advanced capabilities outside the current plan',
          waitDays: 5,
          dueDays: 2,
        },
        {
          id: 'step-4',
          type: 'meeting',
          content_he: 'פגישה לבחינת ROI משדרוג ותיאום תקציב',
          content_en: 'Meeting to review upgrade ROI and align budget',
          waitDays: 5,
          dueDays: 3,
        },
        {
          id: 'step-5',
          type: 'task',
          content_he: 'סגירת שדרוג והרחבת החוזה',
          content_en: 'Close upgrade and expand the contract',
          waitDays: 4,
          dueDays: 2,
        },
      ],
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// Frozen exports
// ─────────────────────────────────────────────────────────────

const CONSTANTS = _deepFreeze({
  TRIGGER_TYPES,
  STEP_TYPES,
  LABELS,
});

module.exports = {
  SalesPlaybook,
  buildDefaultPlaybooks,
  CONSTANTS,
  TRIGGER_TYPES,
  STEP_TYPES,
  LABELS,
};
