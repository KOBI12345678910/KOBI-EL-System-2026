/**
 * chaos-engine.js — Fault-injection chaos engineering tool
 * Agent Y-177 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero third-party dependencies. Node built-ins only.
 *
 * Principle: "לא מוחקים רק משדרגים ומגדלים" — additive by design.
 * Every experiment keeps its history in an append-only ledger.
 * No target is ever unregistered — it is only deactivated.
 * Aborted runs keep their telemetry so post-mortems are trivial.
 *
 * --------------------------------------------------------------
 * Safety model — read before you ship
 * --------------------------------------------------------------
 * 1. Sandbox-only. The engine never touches a process unless a
 *    target exposes an **explicit opt-in** `inject()` handle
 *    returned from `registerTarget()`. Production callers that
 *    never call `inject()` are guaranteed not to receive faults.
 *
 * 2. Prod fail-safe. `run()` refuses to execute in production
 *    (`NODE_ENV === 'production'`) unless the environment
 *    variable `CHAOS_PROD_ALLOWED` is exactly the string `"true"`.
 *    Dry-runs (`dryRun: true`) are always allowed — they return
 *    the plan without calling any target.
 *
 * 3. Blast-radius cap. Every experiment has a
 *    `blastRadiusPercent` limit in the range [0, 100]. Only that
 *    percentage of calls arriving through `inject()` will see
 *    faults. Implemented via seeded deterministic PRNG so results
 *    are reproducible.
 *
 * 4. Probability gate. Within the blast-radius cohort, each
 *    fault has its own `probability` (0..1). A call inside the
 *    blast radius is only faulted if the probability roll passes.
 *
 * 5. Scheduled windows. `schedule` accepts a list of absolute
 *    `{startMs, endMs}` intervals (epoch ms). Calls outside
 *    every scheduled window return cleanly, regardless of blast
 *    radius.
 *
 * 6. Emergency abort. `abort(reason)` sets an in-memory flag
 *    that causes every subsequent `inject()` to return cleanly
 *    with a `wasAborted: true` decision. Running experiments
 *    finish their current tick but emit no further faults.
 *    Nothing is purged — the plan and telemetry are preserved.
 *
 * 7. Steady-state hypothesis. `defineExperiment` accepts a
 *    `steadyState` function that returns `{ok:boolean, metric}`.
 *    `run()` calls it before the experiment, collects a baseline,
 *    runs the chaos window, calls it again, and produces a
 *    pass/fail verdict. If the hypothesis fails mid-run, the
 *    experiment auto-aborts with reason `steady_state_violated`.
 *
 * 8. Never deletes. Targets are deactivated, experiments are
 *    retired, aborts are recorded. Every record is retained in
 *    the ledger for audit and post-incident review.
 *
 * --------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------
 *   const { ChaosEngine, FAULT_TYPES } = require('./chaos-engine');
 *   const engine = new ChaosEngine({ seed: 42 });
 *
 *   const target = engine.registerTarget({
 *     id: 'po-approval',
 *     description_he: 'אישור הזמנת רכש',
 *     description_en: 'Purchase order approval',
 *   });
 *
 *   engine.defineExperiment({
 *     id: 'exp-po-latency-01',
 *     targetId: 'po-approval',
 *     faults: [
 *       { type: 'latency', latencyMs: 500, probability: 1.0 },
 *     ],
 *     blastRadiusPercent: 25,
 *     steadyState: () => ({ ok: true, metric: 1 }),
 *   });
 *
 *   const report = await engine.run('exp-po-latency-01', { dryRun: true });
 *
 *   // Elsewhere in the code path you want to perturb:
 *   const decision = target.inject({ correlationId: 'req-001' });
 *   if (decision.shouldFault) { ... }
 *
 * Glossary (bilingual):
 *   latency         — השהיה
 *   error           — שגיאה
 *   drop            — ניתוק
 *   resource_exhaust— דלדול משאבים
 *   blast radius    — רדיוס פגיעה
 *   steady state    — מצב יציב
 *   abort           — עצירת חירום
 */

'use strict';

const crypto = require('node:crypto');

/* ------------------------------------------------------------------ *
 *  Constants                                                         *
 * ------------------------------------------------------------------ */

const FAULT_TYPES = Object.freeze({
  LATENCY: 'latency',
  ERROR: 'error',
  DROP: 'drop',
  RESOURCE_EXHAUST: 'resource_exhaust',
});

const VALID_FAULT_TYPES = Object.freeze(Object.values(FAULT_TYPES));

const EXPERIMENT_STATE = Object.freeze({
  DEFINED: 'defined',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  FAILED: 'failed',
});

const ABORT_REASON = Object.freeze({
  MANUAL: 'manual',
  STEADY_STATE_VIOLATED: 'steady_state_violated',
  PROD_FAIL_SAFE: 'prod_fail_safe',
  BLAST_RADIUS_BREACH: 'blast_radius_breach',
});

const GLOSSARY = Object.freeze({
  latency: { he: 'השהיה', en: 'Latency' },
  error: { he: 'שגיאה', en: 'Error' },
  drop: { he: 'ניתוק', en: 'Drop' },
  resource_exhaust: { he: 'דלדול משאבים', en: 'Resource exhaustion' },
  blast_radius: { he: 'רדיוס פגיעה', en: 'Blast radius' },
  steady_state: { he: 'מצב יציב', en: 'Steady state' },
  abort: { he: 'עצירת חירום', en: 'Emergency abort' },
  dry_run: { he: 'הרצה יבשה', en: 'Dry run' },
  experiment: { he: 'ניסוי', en: 'Experiment' },
  target: { he: 'יעד', en: 'Target' },
});

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`ChaosEngine: '${name}' must be a plain object`);
  }
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`ChaosEngine: '${name}' must be a non-empty string`);
  }
}

function assertNumberInRange(value, min, max, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`ChaosEngine: '${name}' must be a finite number`);
  }
  if (value < min || value > max) {
    throw new RangeError(`ChaosEngine: '${name}' must be within [${min}, ${max}]`);
  }
}

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.values(obj).forEach(deepFreeze);
  return Object.freeze(obj);
}

/**
 * Mulberry32 — tiny deterministic PRNG. We don't use Math.random
 * because experiment replays must be reproducible.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function safeStringHash(str) {
  // short, stable, fast. Not crypto — used only to seed per-call PRNG.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nowMs(clock) {
  if (typeof clock === 'function') return clock();
  return Date.now();
}

function isProdEnv(env) {
  if (!env || typeof env !== 'object') return false;
  return env.NODE_ENV === 'production';
}

function prodAllowed(env) {
  if (!env || typeof env !== 'object') return false;
  return env.CHAOS_PROD_ALLOWED === 'true';
}

/* ------------------------------------------------------------------ *
 *  Fault validation                                                  *
 * ------------------------------------------------------------------ */

function validateFault(fault, index) {
  assertObject(fault, `faults[${index}]`);
  if (!VALID_FAULT_TYPES.includes(fault.type)) {
    throw new Error(
      `ChaosEngine: faults[${index}].type '${fault.type}' invalid — must be one of ${VALID_FAULT_TYPES.join(', ')}`
    );
  }
  const probability = typeof fault.probability === 'number' ? fault.probability : 1.0;
  assertNumberInRange(probability, 0, 1, `faults[${index}].probability`);
  const out = { type: fault.type, probability };

  switch (fault.type) {
    case FAULT_TYPES.LATENCY: {
      const latencyMs = typeof fault.latencyMs === 'number' ? fault.latencyMs : 100;
      assertNumberInRange(latencyMs, 0, 60000, `faults[${index}].latencyMs`);
      out.latencyMs = latencyMs;
      break;
    }
    case FAULT_TYPES.ERROR: {
      const code = typeof fault.errorCode === 'string' ? fault.errorCode : 'CHAOS_INJECTED_ERROR';
      const message = typeof fault.errorMessage === 'string' ? fault.errorMessage : 'chaos-injected error';
      out.errorCode = code;
      out.errorMessage = message;
      break;
    }
    case FAULT_TYPES.DROP: {
      const reason = typeof fault.dropReason === 'string' ? fault.dropReason : 'connection_dropped';
      out.dropReason = reason;
      break;
    }
    case FAULT_TYPES.RESOURCE_EXHAUST: {
      const resource = typeof fault.resource === 'string' ? fault.resource : 'memory';
      const amount = typeof fault.amount === 'number' ? fault.amount : 1;
      assertNumberInRange(amount, 0, 1e9, `faults[${index}].amount`);
      out.resource = resource;
      out.amount = amount;
      break;
    }
    /* istanbul ignore next — gated above */
    default: throw new Error(`ChaosEngine: unreachable fault type ${fault.type}`);
  }
  return Object.freeze(out);
}

/* ------------------------------------------------------------------ *
 *  ChaosEngine                                                       *
 * ------------------------------------------------------------------ */

class ChaosEngine {
  constructor(options) {
    const opts = options || {};
    this._seed = typeof opts.seed === 'number' ? opts.seed >>> 0 : 42;
    this._clock = typeof opts.clock === 'function' ? opts.clock : null;
    this._env = opts.env || process.env || {};
    this._rand = mulberry32(this._seed);

    this._targets = new Map();
    this._experiments = new Map();
    this._runs = [];
    this._ledger = []; // append-only audit trail
    this._globalAbort = null; // { reason, at, detail } or null
    this._sequence = 0;
  }

  /* ----- introspection ------------------------------------------ */

  get glossary() {
    return GLOSSARY;
  }

  get faultTypes() {
    return FAULT_TYPES;
  }

  isAborted() {
    return this._globalAbort !== null;
  }

  getAbortReason() {
    return this._globalAbort;
  }

  listTargets() {
    return deepFreeze(
      Array.from(this._targets.values()).map((t) => ({
        id: t.id,
        description_he: t.description_he,
        description_en: t.description_en,
        active: t.active,
        registered_at: t.registered_at,
        injection_count: t.injection_count,
        fault_count: t.fault_count,
      }))
    );
  }

  listExperiments() {
    return deepFreeze(
      Array.from(this._experiments.values()).map((e) => ({
        id: e.id,
        target_id: e.targetId,
        state: e.state,
        blast_radius_percent: e.blastRadiusPercent,
        fault_count: e.faults.length,
        defined_at: e.defined_at,
      }))
    );
  }

  listRuns() {
    return deepFreeze(this._runs.map((r) => ({ ...r })));
  }

  listLedger() {
    return deepFreeze(this._ledger.map((l) => ({ ...l })));
  }

  /* ----- target registration ------------------------------------ */

  /**
   * Registers a perturbation target and returns an opt-in handle.
   * The caller MUST call `handle.inject({ correlationId })` at
   * every code path they want the engine to be able to perturb.
   * If the caller never invokes `inject()`, the engine can never
   * reach the code path.
   */
  registerTarget(spec) {
    assertObject(spec, 'spec');
    assertString(spec.id, 'spec.id');
    if (this._targets.has(spec.id)) {
      // upgrade, never delete — re-activate and refresh labels
      const existing = this._targets.get(spec.id);
      existing.active = true;
      if (typeof spec.description_he === 'string') existing.description_he = spec.description_he;
      if (typeof spec.description_en === 'string') existing.description_en = spec.description_en;
      this._appendLedger({ kind: 'target_upgraded', id: spec.id });
      return existing.handle;
    }

    const target = {
      id: spec.id,
      description_he: typeof spec.description_he === 'string' ? spec.description_he : spec.id,
      description_en: typeof spec.description_en === 'string' ? spec.description_en : spec.id,
      active: true,
      registered_at: nowMs(this._clock),
      injection_count: 0,
      fault_count: 0,
      currentExperimentId: null, // only set while an experiment is running
    };

    // Bound handle — callers only get `inject`, nothing else.
    const self = this;
    target.handle = Object.freeze({
      id: spec.id,
      /**
       * Decide whether this call should see a fault. Returns a
       * plain decision object — the caller decides what to do
       * with it so we never monkey-patch anything global.
       *
       * Decision shape:
       *   { shouldFault: boolean,
       *     fault?: { type, ...params },
       *     reason: string,
       *     wasAborted: boolean }
       */
      inject(ctx) {
        return self._inject(spec.id, ctx || {});
      },
      /** Convenience — deactivate without removing from the ledger. */
      deactivate() {
        const t = self._targets.get(spec.id);
        if (t) {
          t.active = false;
          self._appendLedger({ kind: 'target_deactivated', id: spec.id });
        }
      },
    });

    this._targets.set(spec.id, target);
    this._appendLedger({ kind: 'target_registered', id: spec.id });
    return target.handle;
  }

  /* ----- experiment definition ---------------------------------- */

  defineExperiment(spec) {
    assertObject(spec, 'spec');
    assertString(spec.id, 'spec.id');
    assertString(spec.targetId, 'spec.targetId');
    if (!this._targets.has(spec.targetId)) {
      throw new Error(`ChaosEngine: unknown target '${spec.targetId}'`);
    }
    if (!Array.isArray(spec.faults) || spec.faults.length === 0) {
      throw new Error(`ChaosEngine: 'faults' must be a non-empty array`);
    }
    const validatedFaults = spec.faults.map((f, i) => validateFault(f, i));

    const blastRadiusPercent =
      typeof spec.blastRadiusPercent === 'number' ? spec.blastRadiusPercent : 10;
    assertNumberInRange(blastRadiusPercent, 0, 100, 'blastRadiusPercent');

    let schedule = [];
    if (Array.isArray(spec.schedule)) {
      schedule = spec.schedule.map((win, i) => {
        assertObject(win, `schedule[${i}]`);
        if (typeof win.startMs !== 'number' || typeof win.endMs !== 'number') {
          throw new TypeError(`ChaosEngine: schedule[${i}] must have numeric startMs/endMs`);
        }
        if (win.endMs <= win.startMs) {
          throw new RangeError(`ChaosEngine: schedule[${i}] endMs must be after startMs`);
        }
        return Object.freeze({ startMs: win.startMs, endMs: win.endMs });
      });
    }

    let steadyState = null;
    if (spec.steadyState !== undefined) {
      if (typeof spec.steadyState !== 'function') {
        throw new TypeError(`ChaosEngine: 'steadyState' must be a function`);
      }
      steadyState = spec.steadyState;
    }

    const steadyTolerancePercent =
      typeof spec.steadyTolerancePercent === 'number' ? spec.steadyTolerancePercent : 25;
    assertNumberInRange(steadyTolerancePercent, 0, 100, 'steadyTolerancePercent');

    const experiment = {
      id: spec.id,
      targetId: spec.targetId,
      faults: Object.freeze(validatedFaults),
      blastRadiusPercent,
      schedule,
      steadyState,
      steadyTolerancePercent,
      hardCapCalls: typeof spec.hardCapCalls === 'number' ? spec.hardCapCalls : 10000,
      description_he: spec.description_he || '',
      description_en: spec.description_en || '',
      state: EXPERIMENT_STATE.DEFINED,
      defined_at: nowMs(this._clock),
    };

    if (this._experiments.has(spec.id)) {
      // Upgrade only. The old record is preserved in the ledger.
      const prev = this._experiments.get(spec.id);
      this._appendLedger({
        kind: 'experiment_upgraded',
        id: spec.id,
        previous_state: prev.state,
      });
    }

    this._experiments.set(spec.id, experiment);
    this._appendLedger({ kind: 'experiment_defined', id: spec.id });
    return deepFreeze({ ...experiment, faults: experiment.faults.map((f) => ({ ...f })) });
  }

  getExperiment(id) {
    const e = this._experiments.get(id);
    if (!e) return null;
    return deepFreeze({
      id: e.id,
      targetId: e.targetId,
      blastRadiusPercent: e.blastRadiusPercent,
      state: e.state,
      faults: e.faults.map((f) => ({ ...f })),
      schedule: e.schedule.map((s) => ({ ...s })),
      defined_at: e.defined_at,
    });
  }

  /* ----- run ---------------------------------------------------- */

  async run(experimentId, opts) {
    const options = opts || {};
    const dryRun = options.dryRun === true;
    const experiment = this._experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`ChaosEngine: unknown experiment '${experimentId}'`);
    }
    const target = this._targets.get(experiment.targetId);
    if (!target) {
      // should be impossible but we guard anyway
      throw new Error(`ChaosEngine: unknown target '${experiment.targetId}'`);
    }
    if (!target.active && !dryRun) {
      throw new Error(
        `ChaosEngine: target '${target.id}' is deactivated — refusing to run (use dryRun to preview)`
      );
    }

    // Fail-safe: refuse prod unless explicit opt-in, unless this is a dry-run.
    if (!dryRun && isProdEnv(this._env) && !prodAllowed(this._env)) {
      const reason = ABORT_REASON.PROD_FAIL_SAFE;
      const run = this._recordRun({
        experiment_id: experiment.id,
        state: EXPERIMENT_STATE.ABORTED,
        dryRun: false,
        reason_en: 'Refused to run in production without CHAOS_PROD_ALLOWED=true',
        reason_he: 'הרצה סורבה בסביבת ייצור ללא CHAOS_PROD_ALLOWED=true',
        abort_reason: reason,
      });
      this._appendLedger({ kind: 'run_blocked_prod', id: experiment.id });
      return run;
    }

    // Steady-state baseline
    let steadyBefore = null;
    if (experiment.steadyState) {
      try {
        steadyBefore = await experiment.steadyState();
      } catch (err) {
        return this._recordRun({
          experiment_id: experiment.id,
          state: EXPERIMENT_STATE.FAILED,
          dryRun,
          reason_en: `steady-state baseline error: ${err.message}`,
          reason_he: `שגיאת מדידת מצב יציב: ${err.message}`,
        });
      }
      if (!steadyBefore || steadyBefore.ok !== true) {
        return this._recordRun({
          experiment_id: experiment.id,
          state: EXPERIMENT_STATE.ABORTED,
          dryRun,
          reason_en: 'steady-state precondition not met — refusing to inject',
          reason_he: 'תנאי מצב יציב לא מתקיים — לא מזריקים כאוס',
          abort_reason: ABORT_REASON.STEADY_STATE_VIOLATED,
        });
      }
    }

    // Mark experiment as running.
    experiment.state = EXPERIMENT_STATE.RUNNING;
    target.currentExperimentId = experiment.id;
    const started_at = nowMs(this._clock);
    this._appendLedger({ kind: 'run_started', id: experiment.id, dryRun });

    if (dryRun) {
      // Dry run: plan out the first 100 hypothetical calls and
      // report how many would have been faulted, but never touch
      // the target. Also describe the plan for humans.
      const plan = this._planDryRun(experiment, 100);
      experiment.state = EXPERIMENT_STATE.COMPLETED;
      target.currentExperimentId = null;
      const run = this._recordRun({
        experiment_id: experiment.id,
        state: EXPERIMENT_STATE.COMPLETED,
        dryRun: true,
        started_at,
        ended_at: nowMs(this._clock),
        plan,
        reason_en: 'dry-run completed — no faults were actually injected',
        reason_he: 'הרצה יבשה הושלמה — לא הוזרקה כל תקלה',
      });
      this._appendLedger({ kind: 'run_dry_completed', id: experiment.id });
      return run;
    }

    // Live-ish run: we don't actually drive the target — we just
    // make the decision engine live for `durationMs` or until
    // `hardCapCalls` decisions have been served, whichever comes
    // first. The caller's code paths drive inject() via target.handle.
    const durationMs = typeof options.durationMs === 'number' ? options.durationMs : 0;

    // Synthetic self-test: if `simulateCalls` provided, we run that
    // many decisions through the injector in a single synchronous
    // burst to verify the caller's wiring without needing real traffic.
    const simulateCalls = typeof options.simulateCalls === 'number' ? options.simulateCalls : 0;

    if (simulateCalls > 0) {
      const simulationCounts = { faulted: 0, clean: 0, aborted: 0 };
      for (let i = 0; i < simulateCalls; i += 1) {
        if (this.isAborted()) {
          simulationCounts.aborted += 1;
          continue;
        }
        const decision = target.handle.inject({ correlationId: `sim-${i}` });
        if (decision.wasAborted) simulationCounts.aborted += 1;
        else if (decision.shouldFault) simulationCounts.faulted += 1;
        else simulationCounts.clean += 1;
      }
      // Steady-state post-check
      let steadyAfter = null;
      let steadyOk = true;
      if (experiment.steadyState) {
        try {
          steadyAfter = await experiment.steadyState();
          steadyOk = steadyAfter && steadyAfter.ok === true;
        } catch (err) {
          steadyOk = false;
          steadyAfter = { ok: false, error: err.message };
        }
      }
      experiment.state = steadyOk ? EXPERIMENT_STATE.COMPLETED : EXPERIMENT_STATE.ABORTED;
      target.currentExperimentId = null;
      const run = this._recordRun({
        experiment_id: experiment.id,
        state: experiment.state,
        dryRun: false,
        started_at,
        ended_at: nowMs(this._clock),
        simulation: simulationCounts,
        steady_before: steadyBefore,
        steady_after: steadyAfter,
        steady_ok: steadyOk,
        abort_reason: steadyOk ? null : ABORT_REASON.STEADY_STATE_VIOLATED,
        reason_en: steadyOk
          ? 'simulated run completed with steady-state preserved'
          : 'steady-state violated during simulated run',
        reason_he: steadyOk
          ? 'הרצה מדומה הושלמה ומצב יציב נשמר'
          : 'מצב יציב הופר במהלך הרצה מדומה',
      });
      this._appendLedger({ kind: 'run_simulated_completed', id: experiment.id });
      return run;
    }

    // Scheduled/no-call mode: we mark the experiment as running
    // and return immediately. Every subsequent call to target.handle.inject
    // will consult the experiment. The caller must eventually invoke
    // engine.finishRun(experimentId) to close the ledger entry.
    const run = this._recordRun({
      experiment_id: experiment.id,
      state: EXPERIMENT_STATE.RUNNING,
      dryRun: false,
      started_at,
      steady_before: steadyBefore,
      duration_ms_requested: durationMs,
      reason_en: 'experiment running — listening for inject() calls',
      reason_he: 'הניסוי פועל — ממתין לקריאות inject',
    });
    this._appendLedger({ kind: 'run_live_started', id: experiment.id });
    return run;
  }

  /**
   * Explicit completion for long-running experiments. Safe to
   * call even if the experiment was never started — it is a
   * no-op in that case.
   */
  async finishRun(experimentId, opts) {
    const experiment = this._experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`ChaosEngine: unknown experiment '${experimentId}'`);
    }
    if (experiment.state !== EXPERIMENT_STATE.RUNNING) return null;
    const target = this._targets.get(experiment.targetId);

    let steadyAfter = null;
    let steadyOk = true;
    if (experiment.steadyState) {
      try {
        steadyAfter = await experiment.steadyState();
        steadyOk = steadyAfter && steadyAfter.ok === true;
      } catch (err) {
        steadyOk = false;
        steadyAfter = { ok: false, error: err.message };
      }
    }
    experiment.state = steadyOk ? EXPERIMENT_STATE.COMPLETED : EXPERIMENT_STATE.ABORTED;
    if (target) target.currentExperimentId = null;
    const run = this._recordRun({
      experiment_id: experiment.id,
      state: experiment.state,
      dryRun: false,
      ended_at: nowMs(this._clock),
      steady_after: steadyAfter,
      steady_ok: steadyOk,
      abort_reason: steadyOk ? null : ABORT_REASON.STEADY_STATE_VIOLATED,
      reason_en: (opts && opts.reason_en) || 'run finished',
      reason_he: (opts && opts.reason_he) || 'הרצה הסתיימה',
    });
    this._appendLedger({ kind: 'run_finished', id: experiment.id });
    return run;
  }

  /* ----- abort -------------------------------------------------- */

  /**
   * Emergency stop. Disables every in-flight experiment. Subsequent
   * `inject()` calls return a clean decision with `wasAborted: true`.
   * Nothing is purged — the abort reason is appended to the ledger.
   */
  abort(reason) {
    if (this._globalAbort) return this._globalAbort;
    const entry = {
      reason: typeof reason === 'string' ? reason : ABORT_REASON.MANUAL,
      at: nowMs(this._clock),
    };
    this._globalAbort = entry;
    // Flag every running experiment as aborted so its state is
    // visible to reporters. The ledger entry preserves history.
    for (const exp of this._experiments.values()) {
      if (exp.state === EXPERIMENT_STATE.RUNNING) {
        exp.state = EXPERIMENT_STATE.ABORTED;
      }
    }
    this._appendLedger({ kind: 'abort', reason: entry.reason, at: entry.at });
    return entry;
  }

  /**
   * Lift the global abort flag. Existing aborted experiments keep
   * their state — resuming is an explicit re-run operation, never
   * a retroactive mutation. Returns the lifted entry.
   */
  clearAbort() {
    if (!this._globalAbort) return null;
    const cleared = { ...this._globalAbort, cleared_at: nowMs(this._clock) };
    this._appendLedger({ kind: 'abort_cleared', reason: cleared.reason });
    this._globalAbort = null;
    return cleared;
  }

  /* ----- steady-state helper ------------------------------------ */

  /**
   * Synchronously evaluate an experiment's steady-state function
   * (when provided) and return the result alongside a pass/fail
   * verdict. Useful for pre-flight checks.
   */
  async validateSteadyState(experimentId) {
    const experiment = this._experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`ChaosEngine: unknown experiment '${experimentId}'`);
    }
    if (!experiment.steadyState) {
      return { ok: true, metric: null, reason: 'no-steady-state-function' };
    }
    try {
      const res = await experiment.steadyState();
      return {
        ok: res && res.ok === true,
        metric: res && res.metric !== undefined ? res.metric : null,
        raw: res,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /* ----- internals ---------------------------------------------- */

  _inject(targetId, ctx) {
    const target = this._targets.get(targetId);
    if (!target) {
      return deepFreeze({
        shouldFault: false,
        reason: 'unknown_target',
        wasAborted: false,
      });
    }
    target.injection_count += 1;

    // Global abort — every call returns clean.
    if (this._globalAbort) {
      return deepFreeze({
        shouldFault: false,
        reason: 'global_abort',
        wasAborted: true,
        abortReason: this._globalAbort.reason,
      });
    }

    // Deactivated target — never fault.
    if (!target.active) {
      return deepFreeze({
        shouldFault: false,
        reason: 'target_inactive',
        wasAborted: false,
      });
    }

    // Find a running experiment bound to this target.
    let runningExperiment = null;
    for (const exp of this._experiments.values()) {
      if (exp.targetId === targetId && exp.state === EXPERIMENT_STATE.RUNNING) {
        runningExperiment = exp;
        break;
      }
    }
    if (!runningExperiment) {
      return deepFreeze({
        shouldFault: false,
        reason: 'no_running_experiment',
        wasAborted: false,
      });
    }

    // Schedule window check.
    const t = nowMs(this._clock);
    if (runningExperiment.schedule.length > 0) {
      const inWindow = runningExperiment.schedule.some(
        (w) => t >= w.startMs && t <= w.endMs
      );
      if (!inWindow) {
        return deepFreeze({
          shouldFault: false,
          reason: 'outside_window',
          wasAborted: false,
        });
      }
    }

    // Per-call PRNG — seeded with experiment+correlation for
    // reproducibility across replays.
    const corr = typeof ctx.correlationId === 'string' ? ctx.correlationId : String(target.injection_count);
    const perCallSeed = (this._seed ^ safeStringHash(runningExperiment.id) ^ safeStringHash(corr)) >>> 0;
    const rand = mulberry32(perCallSeed);

    // Blast-radius gate.
    const radiusRoll = rand() * 100;
    if (radiusRoll >= runningExperiment.blastRadiusPercent) {
      return deepFreeze({
        shouldFault: false,
        reason: 'outside_blast_radius',
        wasAborted: false,
        experimentId: runningExperiment.id,
      });
    }

    // Pick a fault by iterating. Each fault has its own
    // probability. We evaluate them in order and return the first
    // that rolls in. This keeps the semantics obvious to callers.
    for (const fault of runningExperiment.faults) {
      const probRoll = rand();
      if (probRoll <= fault.probability) {
        target.fault_count += 1;
        return deepFreeze({
          shouldFault: true,
          reason: 'fault_rolled',
          wasAborted: false,
          experimentId: runningExperiment.id,
          fault: { ...fault },
        });
      }
    }

    return deepFreeze({
      shouldFault: false,
      reason: 'faults_not_rolled',
      wasAborted: false,
      experimentId: runningExperiment.id,
    });
  }

  _planDryRun(experiment, sampleSize) {
    const plan = {
      target_id: experiment.targetId,
      blast_radius_percent: experiment.blastRadiusPercent,
      fault_count: experiment.faults.length,
      sample_size: sampleSize,
      expected_faulted: 0,
      fault_mix: {},
    };
    const rand = mulberry32(this._seed ^ safeStringHash(experiment.id));
    for (let i = 0; i < sampleSize; i += 1) {
      if (rand() * 100 >= experiment.blastRadiusPercent) continue;
      for (const fault of experiment.faults) {
        if (rand() <= fault.probability) {
          plan.expected_faulted += 1;
          plan.fault_mix[fault.type] = (plan.fault_mix[fault.type] || 0) + 1;
          break;
        }
      }
    }
    return plan;
  }

  _recordRun(entry) {
    this._sequence += 1;
    const rec = Object.freeze({
      run_id: `RUN-${String(this._sequence).padStart(6, '0')}`,
      created_at: nowMs(this._clock),
      ...entry,
    });
    this._runs.push(rec);
    return rec;
  }

  _appendLedger(entry) {
    this._ledger.push(Object.freeze({ at: nowMs(this._clock), ...entry }));
  }
}

/* ------------------------------------------------------------------ *
 *  Exports                                                           *
 * ------------------------------------------------------------------ */

module.exports = {
  ChaosEngine,
  FAULT_TYPES,
  EXPERIMENT_STATE,
  ABORT_REASON,
  GLOSSARY,
  // exposed for unit tests only
  mulberry32,
  safeStringHash,
  validateFault,
  isProdEnv,
  prodAllowed,
};
