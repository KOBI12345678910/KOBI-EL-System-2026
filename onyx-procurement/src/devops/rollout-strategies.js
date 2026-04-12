/**
 * ONYX — Deployment Rollout Strategy Engine
 * Agent Y-167 — Techno-Kol Uzi mega-ERP DevOps pack.
 * ═══════════════════════════════════════════════════════════════
 *
 * Zero-dependency rollout engine supporting four strategies:
 *
 *   1. blue-green     — full parallel stack; atomic traffic cut-over.
 *   2. canary         — percentage-based waves 5% → 25% → 50% → 100%.
 *   3. rolling        — batch-by-batch update of the existing targets.
 *   4. recreate       — stop-all → start-all (downtime accepted).
 *
 * Features
 * ──────────
 *   • plan(strategy, targets, opts) returns a deterministic, step-by-
 *     step rollout plan with pause points, health-check gates, and
 *     automatic-rollback triggers (error rate / latency / CPU).
 *   • execute(plan, adapter) drives the plan through a mockable
 *     infrastructure adapter — every side effect is delegated so unit
 *     tests never touch real infra.
 *   • pauseBetweenSteps / bakeTime windows implemented via injectable
 *     sleep / clock for deterministic tests.
 *   • Automatic promotion on healthy bake; automatic rollback on gate
 *     breach, with full audit trail and progress events.
 *   • Bilingual (Hebrew / English) progress reporting on every event.
 *
 *                         ┌────────────────────┐
 *   strategy + targets ─▶ │   RolloutStrategy  │ ─▶ plan (steps[])
 *                         └────────────────────┘
 *                                  │
 *                                  ▼   execute(plan, adapter)
 *                         ┌────────────────────┐
 *                         │  InfraAdapter API  │  deploy / health /
 *                         │   (mockable)       │  shiftTraffic / stop
 *                         └────────────────────┘
 *                                  │
 *                                  ▼
 *                         events + audit trail
 *
 * RULES honored: never delete; built-ins only; bilingual.
 *
 * @module src/devops/rollout-strategies
 */

'use strict';

const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

// ─── Enumerations ──────────────────────────────────────────────
const STRATEGIES = Object.freeze({
  BLUE_GREEN: 'blue-green',
  CANARY: 'canary',
  ROLLING: 'rolling',
  RECREATE: 'recreate',
});

const STEP_KINDS = Object.freeze({
  PROVISION: 'provision',      // stand-up new version
  DEPLOY: 'deploy',            // push artifact to batch
  SHIFT_TRAFFIC: 'shift',      // route % traffic to new version
  HEALTH_CHECK: 'health',      // hit health gate
  BAKE: 'bake',                // soak / observe metrics
  PAUSE: 'pause',              // inter-step cooldown
  PROMOTE: 'promote',          // finalize new version
  TEARDOWN_OLD: 'teardown',    // retire old (never delete data)
  ROLLBACK: 'rollback',        // revert to last good
  STOP: 'stop',                // recreate: stop old
  START: 'start',              // recreate: start new
});

const PLAN_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  PROMOTED: 'promoted',
  ROLLED_BACK: 'rolled_back',
  FAILED: 'failed',
});

const CANARY_WAVES = Object.freeze([5, 25, 50, 100]);

// ─── Bilingual labels ──────────────────────────────────────────
const LABELS = Object.freeze({
  [STRATEGIES.BLUE_GREEN]: { en: 'Blue/Green deployment', he: 'פריסה כחול/ירוק' },
  [STRATEGIES.CANARY]:     { en: 'Canary deployment',      he: 'פריסת קנרית' },
  [STRATEGIES.ROLLING]:    { en: 'Rolling deployment',     he: 'פריסה מתגלגלת' },
  [STRATEGIES.RECREATE]:   { en: 'Recreate deployment',    he: 'פריסה מחדש' },

  [STEP_KINDS.PROVISION]:     { en: 'Provision new stack',   he: 'הקמת מחסנית חדשה' },
  [STEP_KINDS.DEPLOY]:        { en: 'Deploy to batch',       he: 'פריסה לקבוצה' },
  [STEP_KINDS.SHIFT_TRAFFIC]: { en: 'Shift traffic',         he: 'הסטת תעבורה' },
  [STEP_KINDS.HEALTH_CHECK]:  { en: 'Health gate',           he: 'בדיקת בריאות' },
  [STEP_KINDS.BAKE]:          { en: 'Bake time',             he: 'זמן אפייה' },
  [STEP_KINDS.PAUSE]:         { en: 'Pause between steps',   he: 'השהייה בין שלבים' },
  [STEP_KINDS.PROMOTE]:       { en: 'Promote new version',   he: 'קידום גרסה חדשה' },
  [STEP_KINDS.TEARDOWN_OLD]:  { en: 'Retire old stack',      he: 'הוצאת מחסנית ישנה משירות' },
  [STEP_KINDS.ROLLBACK]:      { en: 'Rollback to last good', he: 'חזרה לאחור' },
  [STEP_KINDS.STOP]:          { en: 'Stop old targets',      he: 'עצירת יעדים ישנים' },
  [STEP_KINDS.START]:         { en: 'Start new targets',     he: 'הפעלת יעדים חדשים' },

  gateBreach:   { en: 'Health gate breached', he: 'שער בריאות נכשל' },
  bakeOk:       { en: 'Bake passed cleanly',  he: 'אפייה עברה בהצלחה' },
  promoted:     { en: 'Rollout promoted',     he: 'הפריסה קודמה' },
  rolledBack:   { en: 'Rollout rolled back',  he: 'הפריסה הוחזרה לאחור' },
  paused:       { en: 'Rollout paused',       he: 'הפריסה הושהתה' },
  resumed:      { en: 'Rollout resumed',      he: 'הפריסה חודשה' },
});

// ─── Typed errors ──────────────────────────────────────────────
class RolloutError extends Error {
  constructor(message, code, context) {
    super(message);
    this.name = 'RolloutError';
    this.code = code || 'ROLLOUT_ERROR';
    this.context = context || null;
  }
}

class HealthGateBreach extends RolloutError {
  constructor(metric, value, threshold, stepId) {
    super(
      `Health gate breached: ${metric}=${value} exceeds ${threshold}`,
      'HEALTH_GATE_BREACH',
      { metric, value, threshold, stepId }
    );
    this.name = 'HealthGateBreach';
    this.bilingual = {
      en: `Health gate breached at step ${stepId}: ${metric}=${value} exceeds ${threshold}`,
      he: `שער בריאות נכשל בשלב ${stepId}: ${metric}=${value} מעל ${threshold}`,
    };
  }
}

// ─── Defaults ──────────────────────────────────────────────────
const DEFAULT_GATES = Object.freeze({
  maxErrorRate: 0.02,     // 2%
  maxLatencyMs: 800,      // p95 800ms
  maxCpuPct:    0.85,     // 85%
});

const DEFAULT_OPTS = Object.freeze({
  pauseBetweenStepsMs: 2_000,
  bakeTimeMs:          10_000,
  healthCheckRetries:  3,
  autoPromote:         true,
  autoRollback:        true,
  locale:              'he',  // 'he' | 'en' | 'both'
  gates:               DEFAULT_GATES,
});

/**
 * RolloutStrategy
 * ─────────────────
 * Stateless planner + stateful executor.  Each `plan()` call returns
 * an immutable plan object that `execute()` can run (or replay) via
 * an injected InfraAdapter.
 */
class RolloutStrategy extends EventEmitter {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.pauseBetweenStepsMs=2000]
   * @param {number} [opts.bakeTimeMs=10000]
   * @param {number} [opts.healthCheckRetries=3]
   * @param {boolean}[opts.autoPromote=true]
   * @param {boolean}[opts.autoRollback=true]
   * @param {'he'|'en'|'both'} [opts.locale='he']
   * @param {Object} [opts.gates]
   * @param {Function}[opts.sleep]   injectable sleep(ms) → Promise
   * @param {Function}[opts.now]     injectable clock
   * @param {Function}[opts.idGen]   injectable id generator
   */
  constructor(opts = {}) {
    super();
    this.opts = { ...DEFAULT_OPTS, ...opts, gates: { ...DEFAULT_GATES, ...(opts.gates || {}) } };
    this.sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now || (() => Date.now());
    this.idGen = opts.idGen || (() => crypto.randomBytes(6).toString('hex'));
    this.audit = [];
  }

  // ───────────────────────────────────────────────────────────
  // Planning
  // ───────────────────────────────────────────────────────────

  /**
   * Build a deterministic rollout plan.
   * @param {string}   strategy   one of STRATEGIES
   * @param {Array}    targets    e.g. [{id:'svc-1', region:'il'}, ...]
   * @param {Object}   [overrides] per-plan overrides (gates, waves...)
   * @returns {Object} plan object
   */
  plan(strategy, targets, overrides = {}) {
    if (!Object.values(STRATEGIES).includes(strategy)) {
      throw new RolloutError(`Unknown strategy: ${strategy}`, 'UNKNOWN_STRATEGY');
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      throw new RolloutError('targets must be a non-empty array', 'BAD_TARGETS');
    }

    const planId = this.idGen();
    const merged = { ...this.opts, ...overrides, gates: { ...this.opts.gates, ...(overrides.gates || {}) } };
    const planCtx = {
      planId,
      strategy,
      createdAt: this.now(),
      targets: targets.map((t, i) => ({ index: i, ...t })),
      opts: merged,
    };

    let steps;
    switch (strategy) {
      case STRATEGIES.BLUE_GREEN: steps = this._planBlueGreen(planCtx); break;
      case STRATEGIES.CANARY:     steps = this._planCanary(planCtx);    break;
      case STRATEGIES.ROLLING:    steps = this._planRolling(planCtx);   break;
      case STRATEGIES.RECREATE:   steps = this._planRecreate(planCtx);  break;
      default:
        /* istanbul ignore next */
        throw new RolloutError('unreachable', 'INTERNAL');
    }

    // Attach monotonic step ids for traceability.
    steps.forEach((s, i) => { s.stepId = `${planId}-s${i + 1}`; s.index = i; });

    const plan = Object.freeze({
      planId,
      strategy,
      strategyLabel: LABELS[strategy],
      createdAt: planCtx.createdAt,
      targets: planCtx.targets,
      opts: merged,
      gates: merged.gates,
      steps: Object.freeze(steps.map((s) => Object.freeze({ ...s }))),
      status: PLAN_STATUS.PENDING,
    });

    return plan;
  }

  _planBlueGreen(ctx) {
    const steps = [];
    steps.push(this._step(STEP_KINDS.PROVISION, {
      color: 'green',
      targets: ctx.targets.map((t) => t.id),
    }));
    steps.push(this._step(STEP_KINDS.DEPLOY, {
      color: 'green',
      targets: ctx.targets.map((t) => t.id),
    }));
    steps.push(this._step(STEP_KINDS.HEALTH_CHECK, {
      color: 'green',
      gates: ctx.opts.gates,
    }));
    steps.push(this._step(STEP_KINDS.BAKE, { color: 'green', durationMs: ctx.opts.bakeTimeMs }));
    steps.push(this._step(STEP_KINDS.PAUSE, { durationMs: ctx.opts.pauseBetweenStepsMs }));
    steps.push(this._step(STEP_KINDS.SHIFT_TRAFFIC, { from: 'blue', to: 'green', percent: 100 }));
    steps.push(this._step(STEP_KINDS.HEALTH_CHECK, { color: 'green', gates: ctx.opts.gates }));
    steps.push(this._step(STEP_KINDS.PROMOTE, { color: 'green' }));
    steps.push(this._step(STEP_KINDS.TEARDOWN_OLD, { color: 'blue', preserveData: true }));
    return steps;
  }

  _planCanary(ctx) {
    const waves = Array.isArray(ctx.opts.canaryWaves) && ctx.opts.canaryWaves.length
      ? ctx.opts.canaryWaves
      : CANARY_WAVES;
    const steps = [];
    steps.push(this._step(STEP_KINDS.PROVISION, { color: 'canary', targets: ctx.targets.map((t) => t.id) }));
    steps.push(this._step(STEP_KINDS.DEPLOY, { color: 'canary', targets: ctx.targets.map((t) => t.id) }));

    for (const pct of waves) {
      steps.push(this._step(STEP_KINDS.SHIFT_TRAFFIC, { from: 'stable', to: 'canary', percent: pct }));
      steps.push(this._step(STEP_KINDS.HEALTH_CHECK, { color: 'canary', percent: pct, gates: ctx.opts.gates }));
      steps.push(this._step(STEP_KINDS.BAKE, { color: 'canary', percent: pct, durationMs: ctx.opts.bakeTimeMs }));
      if (pct < 100) {
        steps.push(this._step(STEP_KINDS.PAUSE, { durationMs: ctx.opts.pauseBetweenStepsMs, reason: `wave-${pct}` }));
      }
    }
    steps.push(this._step(STEP_KINDS.PROMOTE, { color: 'canary' }));
    steps.push(this._step(STEP_KINDS.TEARDOWN_OLD, { color: 'stable', preserveData: true }));
    return steps;
  }

  _planRolling(ctx) {
    const batchSize = Math.max(1, Number(ctx.opts.batchSize || Math.ceil(ctx.targets.length / 4)));
    const batches = [];
    for (let i = 0; i < ctx.targets.length; i += batchSize) {
      batches.push(ctx.targets.slice(i, i + batchSize));
    }

    const steps = [];
    batches.forEach((batch, i) => {
      steps.push(this._step(STEP_KINDS.DEPLOY, {
        batchIndex: i,
        targets: batch.map((t) => t.id),
      }));
      steps.push(this._step(STEP_KINDS.HEALTH_CHECK, {
        batchIndex: i,
        targets: batch.map((t) => t.id),
        gates: ctx.opts.gates,
      }));
      steps.push(this._step(STEP_KINDS.BAKE, {
        batchIndex: i,
        durationMs: ctx.opts.bakeTimeMs,
      }));
      if (i < batches.length - 1) {
        steps.push(this._step(STEP_KINDS.PAUSE, { durationMs: ctx.opts.pauseBetweenStepsMs }));
      }
    });
    steps.push(this._step(STEP_KINDS.PROMOTE, { rolling: true }));
    return steps;
  }

  _planRecreate(ctx) {
    const ids = ctx.targets.map((t) => t.id);
    return [
      this._step(STEP_KINDS.STOP, { targets: ids, preserveData: true }),
      this._step(STEP_KINDS.DEPLOY, { targets: ids }),
      this._step(STEP_KINDS.START, { targets: ids }),
      this._step(STEP_KINDS.HEALTH_CHECK, { targets: ids, gates: ctx.opts.gates }),
      this._step(STEP_KINDS.BAKE, { durationMs: ctx.opts.bakeTimeMs }),
      this._step(STEP_KINDS.PROMOTE, { recreate: true }),
    ];
  }

  _step(kind, payload) {
    return {
      kind,
      label: LABELS[kind],
      payload: payload || {},
    };
  }

  // ───────────────────────────────────────────────────────────
  // Execution
  // ───────────────────────────────────────────────────────────

  /**
   * Execute a plan against an injected adapter.
   * @param {Object} plan          frozen plan from .plan()
   * @param {Object} adapter       mockable infra adapter
   * @returns {Promise<Object>}    execution summary
   *
   * Adapter contract (all methods may be async; all optional —
   * missing methods are treated as no-ops that resolve successfully):
   *
   *   deploy(step)        → any
   *   provision(step)     → any
   *   shiftTraffic(step)  → any
   *   healthCheck(step)   → { errorRate, latencyP95Ms, cpu } | boolean
   *   stop(step)          → any
   *   start(step)         → any
   *   promote(step)       → any
   *   teardownOld(step)   → any (must preserve data)
   *   rollback(plan, err) → any
   */
  async execute(plan, adapter) {
    if (!plan || !Array.isArray(plan.steps)) {
      throw new RolloutError('execute() requires a valid plan', 'BAD_PLAN');
    }
    const safeAdapter = adapter || {};
    const state = {
      planId: plan.planId,
      strategy: plan.strategy,
      startedAt: this.now(),
      endedAt: null,
      status: PLAN_STATUS.RUNNING,
      stepsExecuted: [],
      currentStep: null,
      error: null,
      rolledBack: false,
    };

    this._emit('rollout:start', plan, state);
    this._record('start', { planId: plan.planId, strategy: plan.strategy });

    for (const step of plan.steps) {
      if (state.status === PLAN_STATUS.PAUSED) break;
      state.currentStep = step;
      this._emit('step:start', plan, state, step);
      this._record('step:start', { stepId: step.stepId, kind: step.kind });

      try {
        const result = await this._runStep(step, plan, safeAdapter);
        const record = {
          stepId: step.stepId,
          kind: step.kind,
          startedAt: this.now(),
          result,
          status: 'ok',
        };
        state.stepsExecuted.push(record);
        this._emit('step:done', plan, state, step, result);
        this._record('step:done', record);
      } catch (err) {
        state.error = err;
        state.status = PLAN_STATUS.FAILED;
        const record = {
          stepId: step.stepId,
          kind: step.kind,
          startedAt: this.now(),
          status: 'error',
          error: err && err.message,
          code: err && err.code,
        };
        state.stepsExecuted.push(record);
        this._emit('step:error', plan, state, step, err);
        this._record('step:error', record);

        if (plan.opts.autoRollback) {
          await this._performRollback(plan, state, safeAdapter, err);
        }
        state.endedAt = this.now();
        this._emit('rollout:end', plan, state);
        this._record('end', {
          planId: plan.planId,
          status: state.status,
          error: err && err.message,
        });
        return this._summary(plan, state);
      }
    }

    if (state.status === PLAN_STATUS.RUNNING) {
      if (plan.opts.autoPromote) {
        state.status = PLAN_STATUS.PROMOTED;
        this._emit('rollout:promoted', plan, state, { bilingual: LABELS.promoted });
        this._record('promoted', { planId: plan.planId });
      }
    }

    state.endedAt = this.now();
    this._emit('rollout:end', plan, state);
    this._record('end', { planId: plan.planId, status: state.status });
    return this._summary(plan, state);
  }

  async _runStep(step, plan, adapter) {
    const k = step.kind;
    switch (k) {
      case STEP_KINDS.PROVISION:
        return this._adapterCall(adapter, 'provision', step, plan);
      case STEP_KINDS.DEPLOY:
        return this._adapterCall(adapter, 'deploy', step, plan);
      case STEP_KINDS.SHIFT_TRAFFIC:
        return this._doShiftTraffic(step, plan, adapter);
      case STEP_KINDS.HEALTH_CHECK:
        return this._doHealthCheck(step, plan, adapter);
      case STEP_KINDS.BAKE:
        return this._doBake(step, plan, adapter);
      case STEP_KINDS.PAUSE:
        return this._doPause(step, plan);
      case STEP_KINDS.STOP:
        return this._adapterCall(adapter, 'stop', step, plan);
      case STEP_KINDS.START:
        return this._adapterCall(adapter, 'start', step, plan);
      case STEP_KINDS.PROMOTE:
        return this._adapterCall(adapter, 'promote', step, plan);
      case STEP_KINDS.TEARDOWN_OLD:
        // Never delete data — we just drain traffic and mark retired.
        return this._adapterCall(adapter, 'teardownOld', step, plan);
      /* istanbul ignore next */
      default:
        throw new RolloutError(`Unknown step kind: ${k}`, 'UNKNOWN_STEP_KIND');
    }
  }

  async _adapterCall(adapter, method, step, plan) {
    const fn = adapter && typeof adapter[method] === 'function' ? adapter[method] : null;
    if (!fn) return { skipped: true, reason: `adapter has no ${method}` };
    const res = await fn.call(adapter, step, plan);
    return res === undefined ? { ok: true } : res;
  }

  async _doShiftTraffic(step, plan, adapter) {
    const pct = Number(step.payload.percent);
    this._emit('progress', plan, {
      kind: 'traffic',
      percent: pct,
      bilingual: {
        en: `Shifting ${pct}% of traffic to ${step.payload.to}`,
        he: `מסיט ${pct}% מהתעבורה אל ${step.payload.to}`,
      },
    });
    return this._adapterCall(adapter, 'shiftTraffic', step, plan);
  }

  async _doHealthCheck(step, plan, adapter) {
    const retries = Math.max(1, Number(plan.opts.healthCheckRetries || 1));
    let lastMetrics = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      const metrics = await this._adapterCall(adapter, 'healthCheck', step, plan);
      lastMetrics = metrics;
      const evalResult = this._evaluateGates(metrics, plan.gates, step.stepId);
      if (evalResult.ok) return { metrics, attempts: attempt };
      if (attempt === retries) throw evalResult.error;
      this._emit('progress', plan, {
        kind: 'retry',
        attempt,
        of: retries,
        bilingual: {
          en: `Health check attempt ${attempt}/${retries} failed, retrying`,
          he: `ניסיון בדיקת בריאות ${attempt}/${retries} נכשל, מנסה שוב`,
        },
      });
    }
    /* istanbul ignore next */
    return { metrics: lastMetrics };
  }

  _evaluateGates(metrics, gates, stepId) {
    // Adapter may return `true` (pass), `false` (fail), or a metrics obj.
    if (metrics === true)  return { ok: true };
    if (metrics === false) {
      return { ok: false, error: new HealthGateBreach('adapter', 'false', 'true', stepId) };
    }
    if (!metrics || typeof metrics !== 'object') return { ok: true };
    if (metrics.skipped) return { ok: true };

    if (typeof metrics.errorRate === 'number' && metrics.errorRate > gates.maxErrorRate) {
      return { ok: false, error: new HealthGateBreach('errorRate', metrics.errorRate, gates.maxErrorRate, stepId) };
    }
    if (typeof metrics.latencyP95Ms === 'number' && metrics.latencyP95Ms > gates.maxLatencyMs) {
      return { ok: false, error: new HealthGateBreach('latencyP95Ms', metrics.latencyP95Ms, gates.maxLatencyMs, stepId) };
    }
    if (typeof metrics.cpu === 'number' && metrics.cpu > gates.maxCpuPct) {
      return { ok: false, error: new HealthGateBreach('cpu', metrics.cpu, gates.maxCpuPct, stepId) };
    }
    return { ok: true };
  }

  async _doBake(step, plan, adapter) {
    const ms = Number(step.payload.durationMs || plan.opts.bakeTimeMs || 0);
    this._emit('progress', plan, {
      kind: 'bake',
      durationMs: ms,
      bilingual: {
        en: `Baking for ${ms}ms to observe metrics`,
        he: `אפייה למשך ${ms} מ"ש לניטור מדדים`,
      },
    });
    await this.sleep(ms);
    // Post-bake metrics re-check through adapter.healthCheck if provided.
    const metrics = await this._adapterCall(adapter, 'healthCheck', step, plan);
    const evalResult = this._evaluateGates(metrics, plan.gates, step.stepId);
    if (!evalResult.ok) throw evalResult.error;
    this._emit('progress', plan, { kind: 'bake:ok', bilingual: LABELS.bakeOk });
    return { bakedMs: ms, metrics };
  }

  async _doPause(step, plan) {
    const ms = Number(step.payload.durationMs || plan.opts.pauseBetweenStepsMs || 0);
    this._emit('progress', plan, {
      kind: 'pause',
      durationMs: ms,
      bilingual: {
        en: `Pausing ${ms}ms between steps`,
        he: `משהה ${ms} מ"ש בין שלבים`,
      },
    });
    await this.sleep(ms);
    return { pausedMs: ms };
  }

  async _performRollback(plan, state, adapter, err) {
    this._emit('rollout:rollback', plan, state, { error: err, bilingual: LABELS.rolledBack });
    this._record('rollback:start', { planId: plan.planId, reason: err && err.message });
    try {
      await this._adapterCall(adapter, 'rollback', { planId: plan.planId, reason: err && err.message }, plan);
      state.rolledBack = true;
      state.status = PLAN_STATUS.ROLLED_BACK;
      this._record('rollback:done', { planId: plan.planId });
    } catch (rbErr) {
      state.rolledBack = false;
      state.status = PLAN_STATUS.FAILED;
      this._record('rollback:error', { planId: plan.planId, error: rbErr && rbErr.message });
    }
  }

  // ───────────────────────────────────────────────────────────
  // Pause / Resume (external control)
  // ───────────────────────────────────────────────────────────

  pause(state) {
    if (!state) return;
    state.status = PLAN_STATUS.PAUSED;
    this._emit('rollout:paused', state, { bilingual: LABELS.paused });
    this._record('pause', { planId: state.planId });
  }

  resume(state) {
    if (!state) return;
    state.status = PLAN_STATUS.RUNNING;
    this._emit('rollout:resumed', state, { bilingual: LABELS.resumed });
    this._record('resume', { planId: state.planId });
  }

  // ───────────────────────────────────────────────────────────
  // Audit trail
  // ───────────────────────────────────────────────────────────

  _record(event, data) {
    this.audit.push({
      at: this.now(),
      event,
      data: data || {},
    });
  }

  getAuditTrail() {
    return this.audit.slice();
  }

  clearAuditTrail() {
    // RULES: never delete — we "archive" instead.
    const archived = this.audit.slice();
    this.audit.length = 0;
    return archived;
  }

  _emit(name, ...args) {
    try {
      this.emit(name, ...args);
    } catch (_e) { /* swallow listener errors so rollout still runs */ }
  }

  // ───────────────────────────────────────────────────────────
  // Reporting helpers
  // ───────────────────────────────────────────────────────────

  _summary(plan, state) {
    return Object.freeze({
      planId: plan.planId,
      strategy: plan.strategy,
      status: state.status,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      durationMs: (state.endedAt || this.now()) - state.startedAt,
      stepsExecuted: state.stepsExecuted.slice(),
      rolledBack: state.rolledBack,
      error: state.error ? {
        message: state.error.message,
        code: state.error.code,
        bilingual: state.error.bilingual || null,
      } : null,
    });
  }

  /**
   * Bilingual human-readable description of a plan.
   * @param {Object} plan
   * @param {'he'|'en'|'both'} [locale]
   * @returns {string}
   */
  describePlan(plan, locale) {
    const loc = locale || this.opts.locale;
    const lines = [];
    const hdrEn = `Rollout plan ${plan.planId} — ${LABELS[plan.strategy].en} (${plan.steps.length} steps)`;
    const hdrHe = `תוכנית פריסה ${plan.planId} — ${LABELS[plan.strategy].he} (${plan.steps.length} שלבים)`;
    if (loc === 'en')      lines.push(hdrEn);
    else if (loc === 'he') lines.push(hdrHe);
    else                   { lines.push(hdrHe); lines.push(hdrEn); }

    plan.steps.forEach((s, i) => {
      const num = i + 1;
      const en = `${num}. ${s.label.en}${s.payload.percent != null ? ` (${s.payload.percent}%)` : ''}`;
      const he = `${num}. ${s.label.he}${s.payload.percent != null ? ` (${s.payload.percent}%)` : ''}`;
      if (loc === 'en')      lines.push(en);
      else if (loc === 'he') lines.push(he);
      else                   { lines.push(he); lines.push(en); }
    });
    return lines.join('\n');
  }

  /**
   * Bilingual percent-progress report for the currently running plan.
   * @param {Object} plan
   * @param {Object} state   execution state from summary or in-flight
   * @param {'he'|'en'|'both'} [locale]
   */
  progressReport(plan, state, locale) {
    const loc = locale || this.opts.locale;
    const total = plan.steps.length;
    const done = (state.stepsExecuted || []).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const en = `Progress: ${done}/${total} steps (${pct}%) — status: ${state.status}`;
    const he = `התקדמות: ${done}/${total} שלבים (${pct}%) — סטטוס: ${state.status}`;
    if (loc === 'en')      return en;
    if (loc === 'he')      return he;
    return `${he}\n${en}`;
  }
}

// ─── Helper: build a null-safe adapter for tests / default runs ───
function buildNullAdapter() {
  return {
    provision:    async () => ({ ok: true }),
    deploy:       async () => ({ ok: true }),
    shiftTraffic: async () => ({ ok: true }),
    healthCheck:  async () => ({ errorRate: 0, latencyP95Ms: 100, cpu: 0.3 }),
    bake:         async () => ({ ok: true }),
    stop:         async () => ({ ok: true }),
    start:        async () => ({ ok: true }),
    promote:      async () => ({ ok: true }),
    teardownOld:  async () => ({ ok: true, preserved: true }),
    rollback:     async () => ({ ok: true }),
  };
}

module.exports = {
  RolloutStrategy,
  RolloutError,
  HealthGateBreach,
  STRATEGIES,
  STEP_KINDS,
  PLAN_STATUS,
  CANARY_WAVES,
  LABELS,
  DEFAULT_GATES,
  buildNullAdapter,
};
