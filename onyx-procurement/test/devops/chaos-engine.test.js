/**
 * Chaos Engine — Unit tests
 * Agent Y-177 — Techno-Kol Uzi ERP — 2026-04-11
 *
 * Run with:  node --test test/devops/chaos-engine.test.js
 * Requires Node >= 18 for the built-in node:test runner.
 *
 * Every test instantiates a brand-new ChaosEngine so we never share
 * state across cases. Clocks and env are injected so nothing depends
 * on wall-clock time or real NODE_ENV.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  ChaosEngine,
  FAULT_TYPES,
  EXPERIMENT_STATE,
  ABORT_REASON,
  GLOSSARY,
  mulberry32,
  safeStringHash,
  validateFault,
  isProdEnv,
  prodAllowed,
} = require(path.resolve(__dirname, '..', '..', 'src', 'devops', 'chaos-engine.js'));

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function makeEngine(overrides) {
  const t0 = 1_712_800_000_000; // 2024-04-11, stable test clock
  let ticks = 0;
  const defaults = {
    seed: 42,
    clock: () => t0 + ticks++,
    env: { NODE_ENV: 'test' },
  };
  return new ChaosEngine({ ...defaults, ...(overrides || {}) });
}

function registerDummyTarget(engine, id) {
  return engine.registerTarget({
    id: id || 'po-approval',
    description_he: 'אישור הזמנת רכש',
    description_en: 'Purchase order approval',
  });
}

/* ------------------------------------------------------------------ *
 *  1 — validateFault                                                 *
 * ------------------------------------------------------------------ */

test('1. validateFault — accepts all four fault types with defaults', () => {
  const latency = validateFault({ type: FAULT_TYPES.LATENCY }, 0);
  assert.equal(latency.type, 'latency');
  assert.equal(latency.latencyMs, 100);
  assert.equal(latency.probability, 1.0);

  const err = validateFault({ type: FAULT_TYPES.ERROR }, 1);
  assert.equal(err.errorCode, 'CHAOS_INJECTED_ERROR');
  assert.equal(err.errorMessage, 'chaos-injected error');

  const drop = validateFault({ type: FAULT_TYPES.DROP }, 2);
  assert.equal(drop.dropReason, 'connection_dropped');

  const exhaust = validateFault(
    { type: FAULT_TYPES.RESOURCE_EXHAUST, resource: 'cpu', amount: 5 },
    3
  );
  assert.equal(exhaust.resource, 'cpu');
  assert.equal(exhaust.amount, 5);
});

test('2. validateFault — rejects unknown types and out-of-range probability', () => {
  assert.throws(() => validateFault({ type: 'explode' }, 0), /invalid/);
  assert.throws(
    () => validateFault({ type: 'latency', probability: 1.5 }, 0),
    RangeError
  );
  assert.throws(
    () => validateFault({ type: 'latency', latencyMs: -1 }, 0),
    RangeError
  );
  assert.throws(() => validateFault(null, 0), TypeError);
});

/* ------------------------------------------------------------------ *
 *  2 — registerTarget + opt-in handle                                *
 * ------------------------------------------------------------------ */

test('3. registerTarget — returns an opt-in handle with only inject+deactivate', () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  assert.equal(typeof handle.inject, 'function');
  assert.equal(typeof handle.deactivate, 'function');
  assert.equal(handle.id, 'po-approval');
  // Handle is frozen — cannot be monkey-patched
  assert.throws(() => { handle.inject = () => {}; }, TypeError);
});

test('4. registerTarget — re-register upgrades, never deletes', () => {
  const engine = makeEngine();
  const h1 = registerDummyTarget(engine);
  const h2 = engine.registerTarget({
    id: 'po-approval',
    description_he: 'אישור מעודכן',
    description_en: 'Updated description',
  });
  // Same underlying handle
  assert.equal(h1.id, h2.id);
  const targets = engine.listTargets();
  assert.equal(targets.length, 1);
  assert.equal(targets[0].description_en, 'Updated description');
  // Ledger records the upgrade
  const ledger = engine.listLedger();
  assert.ok(ledger.some((l) => l.kind === 'target_upgraded'));
});

test('5. inject — without a running experiment returns clean decision', () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  const decision = handle.inject({ correlationId: 'req-1' });
  assert.equal(decision.shouldFault, false);
  assert.equal(decision.reason, 'no_running_experiment');
  assert.equal(decision.wasAborted, false);
});

/* ------------------------------------------------------------------ *
 *  3 — defineExperiment                                              *
 * ------------------------------------------------------------------ */

test('6. defineExperiment — rejects unknown target, empty faults, bad radius', () => {
  const engine = makeEngine();
  registerDummyTarget(engine);
  assert.throws(
    () =>
      engine.defineExperiment({
        id: 'exp-1',
        targetId: 'unknown',
        faults: [{ type: 'latency' }],
      }),
    /unknown target/
  );
  assert.throws(
    () =>
      engine.defineExperiment({
        id: 'exp-2',
        targetId: 'po-approval',
        faults: [],
      }),
    /non-empty array/
  );
  assert.throws(
    () =>
      engine.defineExperiment({
        id: 'exp-3',
        targetId: 'po-approval',
        faults: [{ type: 'latency' }],
        blastRadiusPercent: 150,
      }),
    RangeError
  );
});

test('7. defineExperiment — happy path stores definition and ledger entry', () => {
  const engine = makeEngine();
  registerDummyTarget(engine);
  const exp = engine.defineExperiment({
    id: 'exp-latency',
    targetId: 'po-approval',
    faults: [{ type: 'latency', latencyMs: 300, probability: 1.0 }],
    blastRadiusPercent: 50,
    description_he: 'ניסוי השהיה',
    description_en: 'Latency experiment',
  });
  assert.equal(exp.id, 'exp-latency');
  assert.equal(exp.state, EXPERIMENT_STATE.DEFINED);
  assert.equal(exp.blastRadiusPercent, 50);
  assert.equal(exp.faults[0].latencyMs, 300);
  const ledger = engine.listLedger();
  assert.ok(ledger.some((l) => l.kind === 'experiment_defined' && l.id === 'exp-latency'));
});

/* ------------------------------------------------------------------ *
 *  4 — dry-run                                                       *
 * ------------------------------------------------------------------ */

test('8. run — dryRun returns a plan and never calls inject', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-dry',
    targetId: 'po-approval',
    faults: [{ type: 'error', probability: 1.0 }],
    blastRadiusPercent: 50,
  });
  const run = await engine.run('exp-dry', { dryRun: true });
  assert.equal(run.dryRun, true);
  assert.equal(run.state, EXPERIMENT_STATE.COMPLETED);
  assert.ok(run.plan);
  assert.equal(run.plan.sample_size, 100);
  // Blast radius ~50% with probability 1.0 — should fault close to half,
  // but the exact count is seeded and deterministic. We just assert it is
  // in a reasonable band and that it matches the fault type.
  assert.ok(run.plan.expected_faulted >= 20);
  assert.ok(run.plan.expected_faulted <= 70);
  assert.equal(typeof run.plan.fault_mix.error, 'number');
  // Target injection_count is still 0 — dry runs never touch inject
  assert.equal(engine.listTargets()[0].injection_count, 0);
});

/* ------------------------------------------------------------------ *
 *  5 — probability & blast-radius gating                             *
 * ------------------------------------------------------------------ */

test('9. inject — blast radius of 0% never faults even with probability 1', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-zero-radius',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 0,
  });
  await engine.run('exp-zero-radius', { durationMs: 0 });
  let faulted = 0;
  for (let i = 0; i < 200; i += 1) {
    const d = handle.inject({ correlationId: `r-${i}` });
    if (d.shouldFault) faulted += 1;
  }
  assert.equal(faulted, 0);
});

test('10. inject — 100% blast radius + probability 1 faults every call', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-full',
    targetId: 'po-approval',
    faults: [{ type: 'error', probability: 1.0 }],
    blastRadiusPercent: 100,
  });
  await engine.run('exp-full', { durationMs: 0 });
  for (let i = 0; i < 50; i += 1) {
    const d = handle.inject({ correlationId: `r-${i}` });
    assert.equal(d.shouldFault, true);
    assert.equal(d.fault.type, 'error');
  }
});

test('11. inject — blast radius 25% produces ~25% faults over large N', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-25',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 25,
  });
  await engine.run('exp-25', { durationMs: 0 });
  let faulted = 0;
  const N = 2000;
  for (let i = 0; i < N; i += 1) {
    const d = handle.inject({ correlationId: `r-${i}` });
    if (d.shouldFault) faulted += 1;
  }
  const rate = faulted / N;
  // Allow +-7 percentage points for statistical noise
  assert.ok(rate > 0.18 && rate < 0.32, `rate=${rate}`);
});

/* ------------------------------------------------------------------ *
 *  6 — scheduled windows                                             *
 * ------------------------------------------------------------------ */

test('12. inject — outside a scheduled window returns clean', async () => {
  let t = 1_000_000;
  const engine = new ChaosEngine({
    seed: 7,
    clock: () => t,
    env: { NODE_ENV: 'test' },
  });
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-windowed',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 100,
    schedule: [{ startMs: 2_000_000, endMs: 3_000_000 }],
  });
  await engine.run('exp-windowed', { durationMs: 0 });
  // Clock currently at 1,000,000 which is before the window
  const before = handle.inject({ correlationId: 'a' });
  assert.equal(before.shouldFault, false);
  assert.equal(before.reason, 'outside_window');
  // Advance clock into the window
  t = 2_500_000;
  const inside = handle.inject({ correlationId: 'a' });
  assert.equal(inside.shouldFault, true);
  // Advance past the window
  t = 3_500_000;
  const after = handle.inject({ correlationId: 'a' });
  assert.equal(after.shouldFault, false);
  assert.equal(after.reason, 'outside_window');
});

/* ------------------------------------------------------------------ *
 *  7 — emergency abort                                               *
 * ------------------------------------------------------------------ */

test('13. abort — stops all faults globally and sets wasAborted=true', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-abort',
    targetId: 'po-approval',
    faults: [{ type: 'drop', probability: 1.0 }],
    blastRadiusPercent: 100,
  });
  await engine.run('exp-abort', { durationMs: 0 });
  // Before abort — faults flowing
  assert.equal(handle.inject({ correlationId: 'a' }).shouldFault, true);
  // Pull the emergency switch
  engine.abort('manual_ops');
  assert.equal(engine.isAborted(), true);
  const after = handle.inject({ correlationId: 'b' });
  assert.equal(after.shouldFault, false);
  assert.equal(after.wasAborted, true);
  assert.equal(after.abortReason, 'manual_ops');
  // Experiment state was flipped to aborted
  const exp = engine.getExperiment('exp-abort');
  assert.equal(exp.state, EXPERIMENT_STATE.ABORTED);
});

test('14. clearAbort — lifts flag but aborted experiments stay aborted (history preserved)', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-ab2',
    targetId: 'po-approval',
    faults: [{ type: 'error', probability: 1.0 }],
    blastRadiusPercent: 100,
  });
  await engine.run('exp-ab2', { durationMs: 0 });
  engine.abort();
  assert.equal(engine.isAborted(), true);
  const cleared = engine.clearAbort();
  assert.ok(cleared);
  assert.equal(engine.isAborted(), false);
  // History preserved in ledger
  const ledger = engine.listLedger();
  assert.ok(ledger.some((l) => l.kind === 'abort'));
  assert.ok(ledger.some((l) => l.kind === 'abort_cleared'));
  // Previously aborted experiment stays aborted — never retroactively revived
  const exp = engine.getExperiment('exp-ab2');
  assert.equal(exp.state, EXPERIMENT_STATE.ABORTED);
});

/* ------------------------------------------------------------------ *
 *  8 — production fail-safe                                          *
 * ------------------------------------------------------------------ */

test('15. run — refuses to execute in production without opt-in', async () => {
  const engine = new ChaosEngine({
    seed: 1,
    env: { NODE_ENV: 'production' },
  });
  registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-prod',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 50,
  });
  const run = await engine.run('exp-prod');
  assert.equal(run.state, EXPERIMENT_STATE.ABORTED);
  assert.equal(run.abort_reason, ABORT_REASON.PROD_FAIL_SAFE);
  assert.match(run.reason_en, /CHAOS_PROD_ALLOWED/);
  assert.match(run.reason_he, /CHAOS_PROD_ALLOWED/);
});

test('16. run — allows production with CHAOS_PROD_ALLOWED=true', async () => {
  const engine = new ChaosEngine({
    seed: 1,
    env: { NODE_ENV: 'production', CHAOS_PROD_ALLOWED: 'true' },
  });
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-prod-ok',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 25,
  });
  const run = await engine.run('exp-prod-ok');
  assert.notEqual(run.abort_reason, ABORT_REASON.PROD_FAIL_SAFE);
  assert.equal(run.state, EXPERIMENT_STATE.RUNNING);
});

test('17. run — dryRun in production bypasses the fail-safe', async () => {
  const engine = new ChaosEngine({
    seed: 1,
    env: { NODE_ENV: 'production' },
  });
  registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-prod-dry',
    targetId: 'po-approval',
    faults: [{ type: 'error', probability: 1.0 }],
    blastRadiusPercent: 50,
  });
  const run = await engine.run('exp-prod-dry', { dryRun: true });
  assert.equal(run.state, EXPERIMENT_STATE.COMPLETED);
  assert.equal(run.dryRun, true);
});

/* ------------------------------------------------------------------ *
 *  9 — steady-state hypothesis                                       *
 * ------------------------------------------------------------------ */

test('18. run — refuses to inject when steady-state precondition is false', async () => {
  const engine = makeEngine();
  registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-ss-bad',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 50,
    steadyState: () => ({ ok: false, metric: 0.2 }),
  });
  const run = await engine.run('exp-ss-bad', { durationMs: 0 });
  assert.equal(run.state, EXPERIMENT_STATE.ABORTED);
  assert.equal(run.abort_reason, ABORT_REASON.STEADY_STATE_VIOLATED);
});

test('19. run — steady-state OK, experiment runs and post-state collected', async () => {
  const engine = makeEngine();
  registerDummyTarget(engine);
  let sampleCount = 0;
  engine.defineExperiment({
    id: 'exp-ss-ok',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 50,
    steadyState: () => {
      sampleCount += 1;
      return { ok: true, metric: sampleCount };
    },
  });
  const run = await engine.run('exp-ss-ok', { simulateCalls: 100 });
  assert.equal(run.steady_ok, true);
  assert.equal(run.steady_before.metric, 1);
  assert.equal(run.steady_after.metric, 2);
  assert.equal(run.state, EXPERIMENT_STATE.COMPLETED);
  assert.ok(run.simulation.faulted + run.simulation.clean === 100);
});

test('20. validateSteadyState — returns error details without throwing', async () => {
  const engine = makeEngine();
  registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-ss-throw',
    targetId: 'po-approval',
    faults: [{ type: 'error', probability: 1.0 }],
    blastRadiusPercent: 100,
    steadyState: () => { throw new Error('metric-source-down'); },
  });
  const res = await engine.validateSteadyState('exp-ss-throw');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'metric-source-down');
});

/* ------------------------------------------------------------------ *
 *  10 — simulation + deterministic replay                            *
 * ------------------------------------------------------------------ */

test('21. simulateCalls — deterministic across two engines with same seed', async () => {
  async function runAndCount() {
    const engine = new ChaosEngine({
      seed: 4242,
      env: { NODE_ENV: 'test' },
    });
    const handle = engine.registerTarget({ id: 'repro' });
    engine.defineExperiment({
      id: 'exp-repro',
      targetId: 'repro',
      faults: [{ type: 'latency', probability: 1.0 }],
      blastRadiusPercent: 30,
    });
    await engine.run('exp-repro', { simulateCalls: 500 });
    return engine.listRuns().slice(-1)[0].simulation.faulted;
  }
  const a = await runAndCount();
  const b = await runAndCount();
  assert.equal(a, b);
});

/* ------------------------------------------------------------------ *
 *  11 — upgrade-only ledger                                          *
 * ------------------------------------------------------------------ */

test('22. defineExperiment — re-define keeps the old state in the ledger', () => {
  const engine = makeEngine();
  registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-upg',
    targetId: 'po-approval',
    faults: [{ type: 'latency', latencyMs: 100, probability: 1.0 }],
    blastRadiusPercent: 10,
  });
  engine.defineExperiment({
    id: 'exp-upg',
    targetId: 'po-approval',
    faults: [{ type: 'error', probability: 1.0 }],
    blastRadiusPercent: 25,
  });
  const ledger = engine.listLedger();
  const upgrade = ledger.find((l) => l.kind === 'experiment_upgraded');
  assert.ok(upgrade);
  assert.equal(upgrade.id, 'exp-upg');
  // Only the latest definition is returned
  const exp = engine.getExperiment('exp-upg');
  assert.equal(exp.faults[0].type, 'error');
  assert.equal(exp.blastRadiusPercent, 25);
});

/* ------------------------------------------------------------------ *
 *  12 — target.deactivate                                            *
 * ------------------------------------------------------------------ */

test('23. target.deactivate — stops new faults without deleting the record', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);
  engine.defineExperiment({
    id: 'exp-dea',
    targetId: 'po-approval',
    faults: [{ type: 'latency', probability: 1.0 }],
    blastRadiusPercent: 100,
  });
  await engine.run('exp-dea', { durationMs: 0 });
  assert.equal(handle.inject({ correlationId: 'x' }).shouldFault, true);
  handle.deactivate();
  const after = handle.inject({ correlationId: 'y' });
  assert.equal(after.shouldFault, false);
  assert.equal(after.reason, 'target_inactive');
  // Target still listed — never deleted
  assert.equal(engine.listTargets().length, 1);
  assert.equal(engine.listTargets()[0].active, false);
});

/* ------------------------------------------------------------------ *
 *  13 — bilingual glossary                                           *
 * ------------------------------------------------------------------ */

test('24. GLOSSARY — bilingual entries present and Hebrew non-empty', () => {
  const keys = ['latency', 'error', 'drop', 'resource_exhaust', 'blast_radius', 'steady_state', 'abort'];
  for (const k of keys) {
    assert.ok(GLOSSARY[k], `missing key ${k}`);
    assert.equal(typeof GLOSSARY[k].he, 'string');
    assert.equal(typeof GLOSSARY[k].en, 'string');
    assert.ok(GLOSSARY[k].he.length > 0);
    assert.ok(GLOSSARY[k].en.length > 0);
  }
});

/* ------------------------------------------------------------------ *
 *  14 — misc helpers                                                 *
 * ------------------------------------------------------------------ */

test('25. mulberry32 + safeStringHash — deterministic, bounded output', () => {
  const r1 = mulberry32(1);
  const r2 = mulberry32(1);
  for (let i = 0; i < 20; i += 1) {
    const a = r1();
    const b = r2();
    assert.equal(a, b);
    assert.ok(a >= 0 && a < 1);
  }
  const h1 = safeStringHash('exp-latency');
  const h2 = safeStringHash('exp-latency');
  assert.equal(h1, h2);
  assert.ok(Number.isInteger(h1));
});

test('26. isProdEnv / prodAllowed — env-based gates', () => {
  assert.equal(isProdEnv({ NODE_ENV: 'production' }), true);
  assert.equal(isProdEnv({ NODE_ENV: 'dev' }), false);
  assert.equal(isProdEnv(null), false);
  assert.equal(prodAllowed({ CHAOS_PROD_ALLOWED: 'true' }), true);
  assert.equal(prodAllowed({ CHAOS_PROD_ALLOWED: 'yes' }), false);
  assert.equal(prodAllowed(null), false);
});

/* ------------------------------------------------------------------ *
 *  15 — end-to-end scenario                                          *
 * ------------------------------------------------------------------ */

test('27. end-to-end — define + dryRun + live + abort + ledger intact', async () => {
  const engine = makeEngine();
  const handle = registerDummyTarget(engine);

  // Define
  engine.defineExperiment({
    id: 'exp-e2e',
    targetId: 'po-approval',
    faults: [
      { type: 'latency', latencyMs: 250, probability: 0.5 },
      { type: 'error', probability: 0.5 },
    ],
    blastRadiusPercent: 40,
    steadyState: () => ({ ok: true, metric: 42 }),
    description_he: 'ניסוי מקצה לקצה',
    description_en: 'End-to-end experiment',
  });

  // Dry run
  const dry = await engine.run('exp-e2e', { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.ok(dry.plan);

  // Live run
  const live = await engine.run('exp-e2e', { simulateCalls: 50 });
  assert.equal(live.state, EXPERIMENT_STATE.COMPLETED);
  assert.equal(live.simulation.faulted + live.simulation.clean, 50);

  // Abort just for good measure — no active run now
  engine.abort('drill');
  assert.equal(engine.isAborted(), true);

  // Ledger still has every event
  const ledger = engine.listLedger();
  const kinds = ledger.map((l) => l.kind);
  assert.ok(kinds.includes('target_registered'));
  assert.ok(kinds.includes('experiment_defined'));
  assert.ok(kinds.includes('run_dry_completed'));
  assert.ok(kinds.includes('run_simulated_completed'));
  assert.ok(kinds.includes('abort'));

  // Runs list has both
  const runs = engine.listRuns();
  assert.ok(runs.length >= 2);
});
