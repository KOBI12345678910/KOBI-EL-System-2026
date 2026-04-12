/**
 * Opportunity Stage Manager  |  מנהל שלבי הזדמנות מכירה
 * =============================================================
 *
 * Agent Y-024  |  Swarm Sales  |  Techno-Kol Uzi mega-ERP
 *
 * Configurable sales opportunity pipeline with per-stage exit
 * criteria, stuck-deal detection, stage-to-stage conversion,
 * velocity metrics and weighted-value forecasting.
 *
 * Zero dependencies. Node built-ins only. Bilingual (HE/EN).
 * Deterministic — no random ids, no wall-clock reads inside
 * pure helpers; all timestamps flow through an injectable
 * `now()` clock so tests can pin time.
 *
 * -------------------------------------------------------------
 * RULE: לא מוחקים רק משדרגים ומגדלים
 * -------------------------------------------------------------
 * Pipelines and stages are APPEND-ONLY. Stage transitions for an
 * opportunity are recorded as an immutable history; a pipeline
 * cannot be deleted, only deprecated/archived. Redefining a
 * pipeline with the same id is an upgrade, not a replacement:
 * prior opportunity history keeps its original stage snapshots.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Pipeline {
 *     id, name_he, name_en, version, created_at,
 *     stages: Stage[]
 *   }
 *
 *   Stage {
 *     id, name_he, name_en, probability, order,
 *     terminal?, won?, lost?,
 *     exitCriteria: Criterion[]
 *   }
 *
 *   Criterion {
 *     field      — dot-path into the opportunity (e.g. "amount")
 *     op         — one of: eq, ne, gt, gte, lt, lte, in, nin,
 *                  exists, nexists, truthy, falsy, contains,
 *                  startsWith, endsWith, between, regex
 *     value      — comparison value (type depends on op)
 *     required   — if true, this criterion MUST be met to exit
 *                  (default true). non-required criteria are
 *                  advisory and are reported but do not block.
 *     label_he?, label_en? — optional human-readable labels
 *   }
 *
 *   Opportunity {
 *     id, pipelineId, stageId, amount, currency,
 *     created_at, updated_at, stage_entered_at,
 *     stage_history: StageEvent[],
 *     ...custom fields referenced by criteria
 *   }
 *
 *   StageEvent { stageId, enteredAt, exitedAt?, reason? }
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   new OpportunityPipeline({ now })
 *   definePipeline(spec)                           → Pipeline
 *   getPipeline(id)                                → Pipeline
 *   listPipelines()                                → Pipeline[]
 *   upsertOpportunity(opp)                         → Opportunity
 *   getOpportunity(id)                             → Opportunity
 *   listOpportunities(filter?)                     → Opportunity[]
 *   evaluateExitCriteria(opp, stageId?)            → Evaluation
 *   moveToStage(opportunityId, stageId, opts?)     → Opportunity
 *   autoProgress(opportunity)                      → Opportunity
 *   computeWeightedValue(opportunity)              → number
 *   stageDuration(opportunityId, stageId?, now?)   → number  (ms)
 *   stuckOpportunities(threshold, now?)            → StuckDeal[]
 *   conversionRate(fromStage, toStage, period?)    → ConversionStat
 *   velocity(pipelineId, period?)                  → VelocityStat
 *
 * All durations are returned in MILLISECONDS unless the field
 * name says otherwise (e.g. `days`).
 */

'use strict';

// ═════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_PIPELINE_ID = 'default';

/**
 * Default seed pipeline: Qualification → Discovery → Proposal →
 * Negotiation → Closed-Won / Closed-Lost. Probabilities:
 *   10 / 25 / 50 / 75 / 100 / 0
 */
const DEFAULT_PIPELINE_SPEC = Object.freeze({
  id: DEFAULT_PIPELINE_ID,
  name_he: 'צנרת מכירות ברירת מחדל',
  name_en: 'Default Sales Pipeline',
  stages: [
    {
      id: 'qualification',
      name_he: 'הכשרת ליד',
      name_en: 'Qualification',
      probability: 0.10,
      exitCriteria: [
        { field: 'contact.name',  op: 'truthy', value: true, required: true,
          label_he: 'שם איש קשר', label_en: 'Contact name present' },
        { field: 'contact.email', op: 'truthy', value: true, required: true,
          label_he: 'דוא"ל איש קשר', label_en: 'Contact email present' },
        { field: 'budget_confirmed', op: 'truthy', value: true, required: false,
          label_he: 'תקציב אושר', label_en: 'Budget confirmed' },
      ],
    },
    {
      id: 'discovery',
      name_he: 'איפיון צרכים',
      name_en: 'Discovery',
      probability: 0.25,
      exitCriteria: [
        { field: 'amount', op: 'gt', value: 0, required: true,
          label_he: 'סכום הזדמנות', label_en: 'Amount set' },
        { field: 'needs_summary', op: 'truthy', value: true, required: true,
          label_he: 'סיכום צרכים', label_en: 'Needs summary' },
        { field: 'decision_maker_identified', op: 'truthy', value: true, required: true,
          label_he: 'מקבל החלטות זוהה', label_en: 'Decision maker identified' },
      ],
    },
    {
      id: 'proposal',
      name_he: 'הצעת מחיר',
      name_en: 'Proposal',
      probability: 0.50,
      exitCriteria: [
        { field: 'proposal_sent_at', op: 'exists', value: true, required: true,
          label_he: 'הצעה נשלחה', label_en: 'Proposal sent' },
        { field: 'proposal_version', op: 'gte', value: 1, required: true,
          label_he: 'גרסת הצעה', label_en: 'Proposal version' },
      ],
    },
    {
      id: 'negotiation',
      name_he: 'משא ומתן',
      name_en: 'Negotiation',
      probability: 0.75,
      exitCriteria: [
        { field: 'legal_review_status', op: 'in', value: ['approved', 'waived'], required: true,
          label_he: 'סקירה משפטית', label_en: 'Legal review' },
        { field: 'final_terms_agreed', op: 'truthy', value: true, required: true,
          label_he: 'תנאים סופיים סוכמו', label_en: 'Final terms agreed' },
      ],
    },
    {
      id: 'closed_won',
      name_he: 'נסגר בזכייה',
      name_en: 'Closed-Won',
      probability: 1.00,
      terminal: true,
      won: true,
      exitCriteria: [], // terminal — no exit
    },
    {
      id: 'closed_lost',
      name_he: 'נסגר בהפסד',
      name_en: 'Closed-Lost',
      probability: 0.00,
      terminal: true,
      lost: true,
      exitCriteria: [], // terminal — no exit
    },
  ],
});

// ═════════════════════════════════════════════════════════════
// Pure helpers
// ═════════════════════════════════════════════════════════════

/**
 * Dot-path getter. `getPath({a:{b:2}}, "a.b") → 2`
 */
function getPath(obj, path) {
  if (obj == null || typeof path !== 'string' || path.length === 0) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  if (t instanceof Date) return t.getTime();
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : null;
}

function cloneDeep(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(cloneDeep);
  const out = {};
  for (const k of Object.keys(v)) out[k] = cloneDeep(v[k]);
  return out;
}

/**
 * Evaluate a single criterion against an opportunity.
 * Returns { ok, actual }.
 */
function checkCriterion(opp, criterion) {
  const actual = getPath(opp, criterion.field);
  const op = criterion.op;
  const value = criterion.value;

  let ok = false;
  switch (op) {
    case 'eq':         ok = actual === value; break;
    case 'ne':         ok = actual !== value; break;
    case 'gt':         ok = typeof actual === 'number' && actual >  value; break;
    case 'gte':        ok = typeof actual === 'number' && actual >= value; break;
    case 'lt':         ok = typeof actual === 'number' && actual <  value; break;
    case 'lte':        ok = typeof actual === 'number' && actual <= value; break;
    case 'in':         ok = Array.isArray(value) && value.includes(actual); break;
    case 'nin':        ok = Array.isArray(value) && !value.includes(actual); break;
    case 'exists':     ok = actual !== undefined && actual !== null; break;
    case 'nexists':    ok = actual === undefined || actual === null; break;
    case 'truthy':     ok = Boolean(actual); break;
    case 'falsy':      ok = !actual; break;
    case 'contains':
      if (typeof actual === 'string') ok = actual.includes(String(value));
      else if (Array.isArray(actual)) ok = actual.includes(value);
      break;
    case 'startsWith': ok = typeof actual === 'string' && actual.startsWith(String(value)); break;
    case 'endsWith':   ok = typeof actual === 'string' && actual.endsWith(String(value)); break;
    case 'between':
      ok = Array.isArray(value) && value.length === 2
        && typeof actual === 'number'
        && actual >= value[0] && actual <= value[1];
      break;
    case 'regex':
      try {
        const re = value instanceof RegExp ? value : new RegExp(String(value));
        ok = typeof actual === 'string' && re.test(actual);
      } catch (_e) { ok = false; }
      break;
    default:
      // Unknown op → always fails closed.
      ok = false;
  }
  return { ok, actual };
}

// ═════════════════════════════════════════════════════════════
// Main class
// ═════════════════════════════════════════════════════════════

class OpportunityPipeline {
  /**
   * @param {Object} [opts]
   * @param {() => number} [opts.now] - injectable clock, ms since epoch
   * @param {boolean}      [opts.seedDefault=true] - seed default pipeline
   */
  constructor(opts) {
    const o = opts || {};
    this._now = typeof o.now === 'function' ? o.now : Date.now;
    this._pipelines = new Map();          // id → Pipeline (latest version)
    this._pipelineHistory = new Map();    // id → Pipeline[] (append-only)
    this._opportunities = new Map();      // id → Opportunity

    if (o.seedDefault !== false) {
      this.definePipeline(cloneDeep(DEFAULT_PIPELINE_SPEC));
    }
  }

  // ─────────────────────────────────────────────────────────
  // Pipeline definition
  // ─────────────────────────────────────────────────────────

  /**
   * Define (or upgrade) a pipeline. Append-only: previous versions
   * are preserved in `_pipelineHistory`.
   */
  definePipeline(spec) {
    if (!isPlainObject(spec)) {
      throw new TypeError('definePipeline: spec must be an object');
    }
    if (typeof spec.id !== 'string' || spec.id.length === 0) {
      throw new TypeError('definePipeline: spec.id required');
    }
    if (!Array.isArray(spec.stages) || spec.stages.length === 0) {
      throw new TypeError('definePipeline: spec.stages must be a non-empty array');
    }
    const seen = new Set();
    const stages = spec.stages.map((raw, idx) => {
      if (!isPlainObject(raw)) {
        throw new TypeError(`definePipeline: stage[${idx}] must be an object`);
      }
      if (typeof raw.id !== 'string' || raw.id.length === 0) {
        throw new TypeError(`definePipeline: stage[${idx}].id required`);
      }
      if (seen.has(raw.id)) {
        throw new Error(`definePipeline: duplicate stage id "${raw.id}"`);
      }
      seen.add(raw.id);
      const prob = Number(raw.probability);
      if (!Number.isFinite(prob) || prob < 0 || prob > 1) {
        throw new RangeError(
          `definePipeline: stage[${raw.id}].probability must be in [0,1]`
        );
      }
      const criteria = Array.isArray(raw.exitCriteria) ? raw.exitCriteria : [];
      criteria.forEach((c, ci) => {
        if (!isPlainObject(c) || typeof c.field !== 'string' || typeof c.op !== 'string') {
          throw new TypeError(
            `definePipeline: stage[${raw.id}].exitCriteria[${ci}] invalid`
          );
        }
      });
      return {
        id: raw.id,
        name_he: raw.name_he || raw.id,
        name_en: raw.name_en || raw.id,
        probability: prob,
        order: idx,
        terminal: Boolean(raw.terminal || raw.won || raw.lost),
        won: Boolean(raw.won),
        lost: Boolean(raw.lost),
        exitCriteria: criteria.map((c) => ({
          field: c.field,
          op: c.op,
          value: c.value,
          required: c.required !== false, // default true
          label_he: c.label_he || '',
          label_en: c.label_en || '',
        })),
      };
    });

    const prior = this._pipelines.get(spec.id);
    const version = prior ? (prior.version || 1) + 1 : 1;
    const pipeline = Object.freeze({
      id: spec.id,
      name_he: spec.name_he || spec.id,
      name_en: spec.name_en || spec.id,
      version,
      created_at: this._now(),
      stages: Object.freeze(stages.map((s) => Object.freeze({
        ...s,
        exitCriteria: Object.freeze(s.exitCriteria.map((c) => Object.freeze({ ...c }))),
      }))),
    });

    // Append-only history — do not delete prior versions.
    if (!this._pipelineHistory.has(spec.id)) {
      this._pipelineHistory.set(spec.id, []);
    }
    this._pipelineHistory.get(spec.id).push(pipeline);
    this._pipelines.set(spec.id, pipeline);

    return pipeline;
  }

  getPipeline(id) {
    return this._pipelines.get(id || DEFAULT_PIPELINE_ID);
  }

  getPipelineHistory(id) {
    return (this._pipelineHistory.get(id) || []).slice();
  }

  listPipelines() {
    return Array.from(this._pipelines.values());
  }

  _pipelineForOpportunity(opp) {
    const pipelineId = (opp && opp.pipelineId) || DEFAULT_PIPELINE_ID;
    const p = this._pipelines.get(pipelineId);
    if (!p) throw new Error(`pipeline not found: ${pipelineId}`);
    return p;
  }

  _stageInPipeline(pipeline, stageId) {
    return pipeline.stages.find((s) => s.id === stageId) || null;
  }

  // ─────────────────────────────────────────────────────────
  // Opportunity CRUD (append-only)
  // ─────────────────────────────────────────────────────────

  /**
   * Insert or update an opportunity. If the record is new and
   * has no `stageId`, it is placed at the first stage of its
   * pipeline.
   */
  upsertOpportunity(input) {
    if (!isPlainObject(input) || typeof input.id !== 'string') {
      throw new TypeError('upsertOpportunity: input.id required');
    }
    const now = this._now();
    const existing = this._opportunities.get(input.id);
    // pipelineId is immutable after creation — for existing records
    // we always use the existing pipeline (caller cannot reassign).
    const pipelineId = existing
      ? existing.pipelineId
      : (input.pipelineId || DEFAULT_PIPELINE_ID);
    const pipeline = this._pipelines.get(pipelineId);
    if (!pipeline) throw new Error(`pipeline not found: ${pipelineId}`);

    let stageId = existing ? existing.stageId : (input.stageId || pipeline.stages[0].id);
    if (!this._stageInPipeline(pipeline, stageId)) {
      throw new Error(`stage not in pipeline: ${stageId}`);
    }

    if (existing) {
      // Merge patch — NEVER drop history. Caller cannot overwrite
      // stage_history via this method; use moveToStage.
      const merged = {
        ...existing,
        ...input,
        pipelineId: existing.pipelineId, // immutable after creation
        stageId: existing.stageId,       // use moveToStage to change
        stage_history: existing.stage_history,
        stage_entered_at: existing.stage_entered_at,
        created_at: existing.created_at,
        updated_at: now,
      };
      this._opportunities.set(existing.id, merged);
      return merged;
    }

    const createdAt = toMs(input.created_at) || now;
    const opp = {
      ...input,
      pipelineId,
      stageId,
      amount: Number(input.amount) || 0,
      currency: input.currency || 'ILS',
      created_at: createdAt,
      updated_at: now,
      stage_entered_at: toMs(input.stage_entered_at) || createdAt,
      stage_history: [{
        stageId,
        enteredAt: toMs(input.stage_entered_at) || createdAt,
        exitedAt: null,
        reason: 'created',
      }],
    };
    this._opportunities.set(opp.id, opp);
    return opp;
  }

  getOpportunity(id) {
    return this._opportunities.get(id);
  }

  listOpportunities(filter) {
    const all = Array.from(this._opportunities.values());
    if (!filter) return all;
    return all.filter((o) => {
      if (filter.pipelineId && o.pipelineId !== filter.pipelineId) return false;
      if (filter.stageId && o.stageId !== filter.stageId) return false;
      if (typeof filter.open === 'boolean') {
        const p = this._pipelines.get(o.pipelineId);
        const s = p && this._stageInPipeline(p, o.stageId);
        const isOpen = !(s && s.terminal);
        if (filter.open !== isOpen) return false;
      }
      return true;
    });
  }

  // ─────────────────────────────────────────────────────────
  // Exit-criteria evaluation
  // ─────────────────────────────────────────────────────────

  /**
   * Evaluate the exit criteria for a stage against an opportunity.
   * Defaults to evaluating the opportunity's current stage.
   *
   * @returns {{
   *   stageId: string, met: boolean,
   *   required: Array<{criterion, ok, actual}>,
   *   optional: Array<{criterion, ok, actual}>,
   *   unmet: Array<{criterion, actual}>
   * }}
   */
  evaluateExitCriteria(opp, stageId) {
    if (!opp) throw new TypeError('evaluateExitCriteria: opp required');
    const pipeline = this._pipelineForOpportunity(opp);
    const sid = stageId || opp.stageId;
    const stage = this._stageInPipeline(pipeline, sid);
    if (!stage) throw new Error(`stage not in pipeline: ${sid}`);

    const required = [];
    const optional = [];
    const unmet = [];

    for (const c of stage.exitCriteria) {
      const { ok, actual } = checkCriterion(opp, c);
      const row = { criterion: c, ok, actual };
      if (c.required) required.push(row);
      else optional.push(row);
      if (c.required && !ok) unmet.push({ criterion: c, actual });
    }

    return {
      stageId: sid,
      met: unmet.length === 0,
      required,
      optional,
      unmet,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Stage transitions
  // ─────────────────────────────────────────────────────────

  /**
   * Move an opportunity to a target stage. Validates the EXIT
   * criteria of the CURRENT stage when moving FORWARD. Backward
   * moves (rollbacks) are always allowed but recorded with a
   * reason so audit trails are clean.
   *
   * @param {string} opportunityId
   * @param {string} targetStageId
   * @param {Object} [opts]
   * @param {boolean} [opts.force=false] — override unmet criteria
   * @param {string}  [opts.reason]      — audit note
   * @returns {Opportunity}
   * @throws  when exit criteria of current stage are unmet
   */
  moveToStage(opportunityId, targetStageId, opts) {
    const o = this._opportunities.get(opportunityId);
    if (!o) throw new Error(`opportunity not found: ${opportunityId}`);
    const pipeline = this._pipelineForOpportunity(o);
    const current = this._stageInPipeline(pipeline, o.stageId);
    const target  = this._stageInPipeline(pipeline, targetStageId);
    if (!target) throw new Error(`stage not in pipeline: ${targetStageId}`);
    if (current && current.id === target.id) return o; // no-op

    const options = opts || {};
    const isForward = (target.order || 0) > (current ? (current.order || 0) : -1);

    if (isForward && !options.force && current && current.exitCriteria.length > 0) {
      const evalResult = this.evaluateExitCriteria(o, current.id);
      if (!evalResult.met) {
        const labels = evalResult.unmet
          .map((u) => u.criterion.label_en || u.criterion.field)
          .join(', ');
        const err = new Error(
          `exit criteria unmet for stage "${current.id}": ${labels}`
        );
        err.code = 'EXIT_CRITERIA_UNMET';
        err.unmet = evalResult.unmet;
        err.fromStage = current.id;
        err.toStage = target.id;
        throw err;
      }
    }

    const now = this._now();

    // Close the previous stage event — APPEND-ONLY, do not delete.
    const history = o.stage_history.slice();
    const last = history[history.length - 1];
    if (last && last.exitedAt == null) {
      history[history.length - 1] = { ...last, exitedAt: now };
    }
    history.push({
      stageId: target.id,
      enteredAt: now,
      exitedAt: null,
      reason: options.reason || (isForward ? 'progress' : 'rollback'),
    });

    const updated = {
      ...o,
      stageId: target.id,
      stage_entered_at: now,
      updated_at: now,
      stage_history: history,
    };
    this._opportunities.set(o.id, updated);
    return updated;
  }

  /**
   * Advance an opportunity to the NEXT stage automatically if all
   * required exit criteria of its current stage are met. Returns
   * the opportunity (unchanged if it could not progress). Terminal
   * stages never auto-progress.
   */
  autoProgress(opportunityOrId) {
    const id = typeof opportunityOrId === 'string'
      ? opportunityOrId
      : (opportunityOrId && opportunityOrId.id);
    const o = this._opportunities.get(id);
    if (!o) throw new Error(`opportunity not found: ${id}`);
    const pipeline = this._pipelineForOpportunity(o);
    const current = this._stageInPipeline(pipeline, o.stageId);
    if (!current || current.terminal) return o;

    const evalResult = this.evaluateExitCriteria(o, current.id);
    if (!evalResult.met) return o;

    const next = pipeline.stages.find(
      (s) => (s.order || 0) === (current.order || 0) + 1 && !s.lost,
    );
    if (!next) return o;
    return this.moveToStage(o.id, next.id, { reason: 'auto-progress' });
  }

  // ─────────────────────────────────────────────────────────
  // Analytics
  // ─────────────────────────────────────────────────────────

  /**
   * Weighted value = amount × current-stage probability.
   * Terminal-lost stages return 0; terminal-won returns amount.
   */
  computeWeightedValue(opp) {
    if (!opp) return 0;
    const pipeline = this._pipelineForOpportunity(opp);
    const stage = this._stageInPipeline(pipeline, opp.stageId);
    if (!stage) return 0;
    const amount = Number(opp.amount) || 0;
    return Math.round(amount * stage.probability * 100) / 100;
  }

  /**
   * How long has an opportunity spent in a given stage? Defaults to
   * the current stage. Returns MILLISECONDS.
   *
   * If the stage was entered multiple times (rollback + re-enter),
   * all intervals are SUMMED so the metric reflects true time-in-stage.
   */
  stageDuration(opportunityId, stageId, nowMs) {
    const o = this._opportunities.get(opportunityId);
    if (!o) throw new Error(`opportunity not found: ${opportunityId}`);
    const sid = stageId || o.stageId;
    const asOf = (typeof nowMs === 'number') ? nowMs : this._now();
    let total = 0;
    for (const ev of o.stage_history) {
      if (ev.stageId !== sid) continue;
      const start = ev.enteredAt;
      const end = ev.exitedAt != null ? ev.exitedAt : asOf;
      if (typeof start === 'number' && typeof end === 'number' && end >= start) {
        total += (end - start);
      }
    }
    return total;
  }

  /**
   * Return opportunities that have been in their CURRENT stage
   * longer than the given threshold.
   *
   * @param {number|Object} threshold
   *   - number: default threshold in DAYS applied to every non-terminal stage
   *   - object: per-stage map `{ stageId: days }`, with an optional `default` key
   * @param {number} [nowMs]  — pinned clock for tests
   * @returns {Array<{opportunity, stageId, days, threshold}>}
   */
  stuckOpportunities(threshold, nowMs) {
    const asOf = (typeof nowMs === 'number') ? nowMs : this._now();
    const perStage = {};
    let defaultDays = 30;
    if (typeof threshold === 'number' && Number.isFinite(threshold)) {
      defaultDays = threshold;
    } else if (isPlainObject(threshold)) {
      if (typeof threshold.default === 'number') defaultDays = threshold.default;
      for (const k of Object.keys(threshold)) {
        if (k === 'default') continue;
        perStage[k] = Number(threshold[k]);
      }
    }

    const out = [];
    for (const o of this._opportunities.values()) {
      const pipeline = this._pipelines.get(o.pipelineId);
      if (!pipeline) continue;
      const stage = this._stageInPipeline(pipeline, o.stageId);
      if (!stage || stage.terminal) continue;
      const thresholdDays = perStage[stage.id] != null ? perStage[stage.id] : defaultDays;
      const ms = this.stageDuration(o.id, stage.id, asOf);
      const days = ms / MS_PER_DAY;
      if (days >= thresholdDays) {
        out.push({
          opportunity: o,
          stageId: stage.id,
          stageName_he: stage.name_he,
          stageName_en: stage.name_en,
          days: Math.round(days * 100) / 100,
          threshold: thresholdDays,
        });
      }
    }
    // Stuck longest first — helps prioritise rescue.
    out.sort((a, b) => b.days - a.days);
    return out;
  }

  /**
   * Stage-to-stage conversion rate over a period.
   *
   * Counts opportunities whose stage_history shows a transition
   * from `fromStage` to `toStage` (either directly next, or any
   * later point). The denominator is the number of opportunities
   * that EVER ENTERED `fromStage` in the period.
   *
   * @param {string} fromStageId
   * @param {string} toStageId
   * @param {{from?:number, to?:number, pipelineId?:string}} [period]
   * @returns {{fromStage, toStage, entered, converted, rate, period}}
   */
  conversionRate(fromStageId, toStageId, period) {
    const p = period || {};
    const fromTs = toMs(p.from) != null ? toMs(p.from) : -Infinity;
    const toTs   = toMs(p.to)   != null ? toMs(p.to)   :  Infinity;
    let entered = 0;
    let converted = 0;

    for (const o of this._opportunities.values()) {
      if (p.pipelineId && o.pipelineId !== p.pipelineId) continue;
      const history = o.stage_history || [];
      // Did we enter fromStage inside the window?
      let enteredAt = null;
      for (const ev of history) {
        if (ev.stageId === fromStageId
            && ev.enteredAt >= fromTs
            && ev.enteredAt <= toTs) {
          enteredAt = ev.enteredAt;
          break;
        }
      }
      if (enteredAt == null) continue;
      entered += 1;
      // Any subsequent entry into toStage counts as conversion.
      for (const ev of history) {
        if (ev.stageId === toStageId && ev.enteredAt >= enteredAt) {
          converted += 1;
          break;
        }
      }
    }
    const rate = entered === 0 ? 0 : converted / entered;
    return {
      fromStage: fromStageId,
      toStage: toStageId,
      entered,
      converted,
      rate: Math.round(rate * 10000) / 10000,
      period: { from: p.from || null, to: p.to || null },
    };
  }

  /**
   * Average days-to-close for a pipeline over a period. Only
   * opportunities that reached a terminal (won) stage within the
   * period are counted. Open deals are excluded.
   *
   * @param {string} [pipelineId]
   * @param {{from?:number, to?:number, includeLost?:boolean}} [period]
   * @returns {{pipelineId, samples, avgDays, medianDays, minDays, maxDays, wonCount, lostCount}}
   */
  velocity(pipelineId, period) {
    const pid = pipelineId || DEFAULT_PIPELINE_ID;
    const p = period || {};
    const fromTs = toMs(p.from) != null ? toMs(p.from) : -Infinity;
    const toTs   = toMs(p.to)   != null ? toMs(p.to)   :  Infinity;
    const pipeline = this._pipelines.get(pid);
    if (!pipeline) throw new Error(`pipeline not found: ${pid}`);

    const durations = [];
    let wonCount = 0;
    let lostCount = 0;

    for (const o of this._opportunities.values()) {
      if (o.pipelineId !== pid) continue;
      const stage = this._stageInPipeline(pipeline, o.stageId);
      if (!stage || !stage.terminal) continue;
      const closedAt = o.stage_entered_at;
      if (closedAt < fromTs || closedAt > toTs) continue;
      if (stage.lost) {
        lostCount += 1;
        if (!p.includeLost) continue;
      } else if (stage.won) {
        wonCount += 1;
      }
      const ms = closedAt - o.created_at;
      if (ms >= 0) durations.push(ms / MS_PER_DAY);
    }

    durations.sort((a, b) => a - b);
    const samples = durations.length;
    const sum = durations.reduce((a, b) => a + b, 0);
    const avgDays = samples === 0 ? 0 : sum / samples;
    const medianDays = samples === 0
      ? 0
      : samples % 2 === 1
        ? durations[(samples - 1) / 2]
        : (durations[samples / 2 - 1] + durations[samples / 2]) / 2;

    return {
      pipelineId: pid,
      samples,
      avgDays: Math.round(avgDays * 100) / 100,
      medianDays: Math.round(medianDays * 100) / 100,
      minDays: samples === 0 ? 0 : Math.round(durations[0] * 100) / 100,
      maxDays: samples === 0 ? 0 : Math.round(durations[samples - 1] * 100) / 100,
      wonCount,
      lostCount,
    };
  }
}

// ═════════════════════════════════════════════════════════════
// Exports
// ═════════════════════════════════════════════════════════════

module.exports = {
  OpportunityPipeline,
  DEFAULT_PIPELINE_SPEC,
  DEFAULT_PIPELINE_ID,
  MS_PER_DAY,
  _internal: {
    getPath,
    checkCriterion,
    cloneDeep,
    toMs,
  },
};
