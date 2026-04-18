/**
 * Unit tests for src/devops/rollout-strategies.js
 * Agent Y-167 — DevOps rollout engine.
 *
 * Run:
 *   node --test onyx-procurement/test/devops/rollout-strategies.test.js
 *
 * Strategy:
 *   - Injected sleep/now/idGen so every test is deterministic and
 *     completes in milliseconds.
 *   - Mockable InfraAdapter records calls for assertion.
 *   - Bilingual progress strings are asserted where applicable.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RolloutStrategy,
  RolloutError,
  HealthGateBreach,
  STRATEGIES,
  STEP_KINDS,
  PLAN_STATUS,
  CANARY_WAVES,
  LABELS,
  buildNullAdapter,
} = require('../../src/devops/rollout-strategies');

// ─── Test helpers ──────────────────────────────────────────────
function makeClock(start = 1_700_000_000_000) {
  const state = { t: start };
  return {
    now: () => state.t,
    advance: (ms) => { state.t += ms; },
  };
}

function makeEngine(extra = {}) {
  const clock = makeClock();
  const idSeq = { n: 0 };
  const slept = [];
  const engine = new RolloutStrategy({
    pauseBetweenStepsMs: 5,
    bakeTimeMs: 10,
    healthCheckRetries: 2,
    locale: 'both',
    now: clock.now,
    idGen: () => `t${++idSeq.n}`,
    sleep: async (ms) => { slept.push(ms); clock.advance(ms); },
    ...extra,
  });
  return { engine, clock, slept };
}

function makeRecordingAdapter(overrides = {}) {
  const calls = [];
  const track = (name) => async (step, plan) => {
    calls.push({ name, stepId: step && step.stepId, kind: step && step.kind });
    return overrides[name] ? overrides[name](step, plan) : { ok: true };
  };
  return {
    calls,
    provision:    track('provision'),
    deploy:       track('deploy'),
    shiftTraffic: track('shiftTraffic'),
    healthCheck:  overrides.healthCheck
      ? async (step, plan) => { calls.push({ name: 'healthCheck', stepId: step.stepId, kind: step.kind }); return overrides.healthCheck(step, plan); }
      : async (step) => { calls.push({ name: 'healthCheck', stepId: step.stepId, kind: step.kind }); return { errorRate: 0, latencyP95Ms: 100, cpu: 0.3 }; },
    stop:         track('stop'),
    start:        track('start'),
    promote:      track('promote'),
    teardownOld:  track('teardownOld'),
    rollback:     track('rollback'),
  };
}

const TARGETS = [
  { id: 'svc-1', region: 'il' },
  { id: 'svc-2', region: 'il' },
  { id: 'svc-3', region: 'eu' },
  { id: 'svc-4', region: 'eu' },
];

// ───────────────────────────────────────────────────────────────
// 1. Plan: blue-green structure
// ───────────────────────────────────────────────────────────────
test('plan(blue-green) produces provision→deploy→health→bake→shift→promote→teardown', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  const kinds = plan.steps.map((s) => s.kind);
  assert.ok(kinds.includes(STEP_KINDS.PROVISION));
  assert.ok(kinds.includes(STEP_KINDS.DEPLOY));
  assert.ok(kinds.includes(STEP_KINDS.SHIFT_TRAFFIC));
  assert.ok(kinds.includes(STEP_KINDS.PROMOTE));
  assert.ok(kinds.includes(STEP_KINDS.TEARDOWN_OLD));
  assert.equal(plan.strategy, STRATEGIES.BLUE_GREEN);
  assert.equal(plan.status, PLAN_STATUS.PENDING);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.steps));
});

// ───────────────────────────────────────────────────────────────
// 2. Plan: canary waves 5/25/50/100
// ───────────────────────────────────────────────────────────────
test('plan(canary) emits 4 shifts at 5/25/50/100 percent', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.CANARY, TARGETS);
  const shifts = plan.steps.filter((s) => s.kind === STEP_KINDS.SHIFT_TRAFFIC);
  assert.equal(shifts.length, 4);
  assert.deepEqual(shifts.map((s) => s.payload.percent), [5, 25, 50, 100]);
  assert.deepEqual(CANARY_WAVES, Object.freeze([5, 25, 50, 100]));
});

// ───────────────────────────────────────────────────────────────
// 3. Plan: rolling batch size default = ceil(n/4)
// ───────────────────────────────────────────────────────────────
test('plan(rolling) splits targets into default batches', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.ROLLING, TARGETS); // 4 targets → batch=1
  const deploys = plan.steps.filter((s) => s.kind === STEP_KINDS.DEPLOY);
  assert.equal(deploys.length, 4);
  assert.equal(deploys[0].payload.targets.length, 1);
});

// ───────────────────────────────────────────────────────────────
// 4. Plan: rolling with explicit batchSize
// ───────────────────────────────────────────────────────────────
test('plan(rolling) respects explicit batchSize override', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.ROLLING, TARGETS, { batchSize: 2 });
  const deploys = plan.steps.filter((s) => s.kind === STEP_KINDS.DEPLOY);
  assert.equal(deploys.length, 2);
  assert.deepEqual(deploys[0].payload.targets, ['svc-1', 'svc-2']);
  assert.deepEqual(deploys[1].payload.targets, ['svc-3', 'svc-4']);
});

// ───────────────────────────────────────────────────────────────
// 5. Plan: recreate contains stop→deploy→start→health
// ───────────────────────────────────────────────────────────────
test('plan(recreate) contains stop→deploy→start→health order', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.RECREATE, TARGETS);
  const kinds = plan.steps.map((s) => s.kind);
  assert.deepEqual(
    kinds,
    [STEP_KINDS.STOP, STEP_KINDS.DEPLOY, STEP_KINDS.START, STEP_KINDS.HEALTH_CHECK, STEP_KINDS.BAKE, STEP_KINDS.PROMOTE]
  );
});

// ───────────────────────────────────────────────────────────────
// 6. Plan rejects unknown strategy + empty targets
// ───────────────────────────────────────────────────────────────
test('plan() throws RolloutError on bad inputs', () => {
  const { engine } = makeEngine();
  assert.throws(() => engine.plan('shotgun', TARGETS), RolloutError);
  assert.throws(() => engine.plan(STRATEGIES.CANARY, []), RolloutError);
  assert.throws(() => engine.plan(STRATEGIES.CANARY, null), RolloutError);
});

// ───────────────────────────────────────────────────────────────
// 7. Execute: blue-green happy path promotes and calls teardown
// ───────────────────────────────────────────────────────────────
test('execute(blue-green) promotes and retires old stack without deleting data', async () => {
  const { engine } = makeEngine();
  const adapter = makeRecordingAdapter();
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  const summary = await engine.execute(plan, adapter);
  assert.equal(summary.status, PLAN_STATUS.PROMOTED);
  assert.ok(adapter.calls.some((c) => c.name === 'provision'));
  assert.ok(adapter.calls.some((c) => c.name === 'shiftTraffic'));
  assert.ok(adapter.calls.some((c) => c.name === 'promote'));
  assert.ok(adapter.calls.some((c) => c.name === 'teardownOld'));
  // Verify teardown payload preserves data (never delete rule).
  const teardown = plan.steps.find((s) => s.kind === STEP_KINDS.TEARDOWN_OLD);
  assert.equal(teardown.payload.preserveData, true);
});

// ───────────────────────────────────────────────────────────────
// 8. Execute: canary runs each wave and hits health check per wave
// ───────────────────────────────────────────────────────────────
test('execute(canary) performs a health check and bake per wave', async () => {
  const { engine } = makeEngine();
  const adapter = makeRecordingAdapter();
  const plan = engine.plan(STRATEGIES.CANARY, TARGETS);
  await engine.execute(plan, adapter);
  const healthCalls = adapter.calls.filter((c) => c.name === 'healthCheck');
  // 4 waves × (1 health + 1 bake post-check) = 8
  assert.equal(healthCalls.length, 8);
  const shifts = adapter.calls.filter((c) => c.name === 'shiftTraffic');
  assert.equal(shifts.length, 4);
});

// ───────────────────────────────────────────────────────────────
// 9. Auto-rollback on error-rate breach
// ───────────────────────────────────────────────────────────────
test('execute rolls back when errorRate exceeds gate', async () => {
  const { engine } = makeEngine();
  const adapter = makeRecordingAdapter({
    healthCheck: async () => ({ errorRate: 0.5, latencyP95Ms: 50, cpu: 0.2 }),
  });
  const plan = engine.plan(STRATEGIES.CANARY, TARGETS);
  const summary = await engine.execute(plan, adapter);
  assert.equal(summary.status, PLAN_STATUS.ROLLED_BACK);
  assert.equal(summary.rolledBack, true);
  assert.equal(summary.error.code, 'HEALTH_GATE_BREACH');
  assert.ok(adapter.calls.some((c) => c.name === 'rollback'));
  // Bilingual error text present
  assert.ok(summary.error.bilingual.en.includes('errorRate'));
  assert.ok(summary.error.bilingual.he.includes('שער'));
});

// ───────────────────────────────────────────────────────────────
// 10. Auto-rollback on latency breach
// ───────────────────────────────────────────────────────────────
test('execute rolls back when latencyP95Ms exceeds gate', async () => {
  const { engine } = makeEngine({ healthCheckRetries: 1 });
  const adapter = makeRecordingAdapter({
    healthCheck: async () => ({ errorRate: 0, latencyP95Ms: 5000, cpu: 0.2 }),
  });
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  const summary = await engine.execute(plan, adapter);
  assert.equal(summary.status, PLAN_STATUS.ROLLED_BACK);
  assert.equal(summary.error.code, 'HEALTH_GATE_BREACH');
  assert.ok(/latencyP95Ms/.test(summary.error.message));
});

// ───────────────────────────────────────────────────────────────
// 11. Auto-rollback on CPU breach
// ───────────────────────────────────────────────────────────────
test('execute rolls back when cpu exceeds gate', async () => {
  const { engine } = makeEngine({ healthCheckRetries: 1 });
  const adapter = makeRecordingAdapter({
    healthCheck: async () => ({ errorRate: 0, latencyP95Ms: 100, cpu: 0.99 }),
  });
  const plan = engine.plan(STRATEGIES.ROLLING, TARGETS, { batchSize: 4 });
  const summary = await engine.execute(plan, adapter);
  assert.equal(summary.status, PLAN_STATUS.ROLLED_BACK);
  assert.ok(/cpu/.test(summary.error.message));
});

// ───────────────────────────────────────────────────────────────
// 12. Health check retries succeed before failure count is reached
// ───────────────────────────────────────────────────────────────
test('health check retries on transient failure and recovers', async () => {
  const { engine } = makeEngine({ healthCheckRetries: 3 });
  let call = 0;
  const adapter = makeRecordingAdapter({
    healthCheck: async () => {
      call++;
      if (call === 1) return { errorRate: 0.5, latencyP95Ms: 50, cpu: 0.2 };
      return { errorRate: 0.001, latencyP95Ms: 50, cpu: 0.2 };
    },
  });
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  const summary = await engine.execute(plan, adapter);
  assert.equal(summary.status, PLAN_STATUS.PROMOTED);
});

// ───────────────────────────────────────────────────────────────
// 13. BakeTime is honored via injected sleep
// ───────────────────────────────────────────────────────────────
test('execute honors bakeTimeMs and pauseBetweenStepsMs via injected sleep', async () => {
  const { engine, slept } = makeEngine({ bakeTimeMs: 500, pauseBetweenStepsMs: 100 });
  const adapter = makeRecordingAdapter();
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  await engine.execute(plan, adapter);
  // Bake happened at least once with the configured duration.
  assert.ok(slept.includes(500));
  assert.ok(slept.includes(100));
});

// ───────────────────────────────────────────────────────────────
// 14. Progress events fire with bilingual payloads
// ───────────────────────────────────────────────────────────────
test('progress events carry bilingual messages (he + en)', async () => {
  const { engine } = makeEngine();
  const events = [];
  engine.on('progress', (plan, evt) => events.push(evt));
  const plan = engine.plan(STRATEGIES.CANARY, TARGETS);
  await engine.execute(plan, makeRecordingAdapter());
  const traffic = events.find((e) => e.kind === 'traffic');
  assert.ok(traffic);
  assert.ok(traffic.bilingual.en.length > 0);
  assert.ok(traffic.bilingual.he.length > 0);
  // Hebrew string contains Hebrew letters.
  assert.ok(/[\u0590-\u05FF]/.test(traffic.bilingual.he));
});

// ───────────────────────────────────────────────────────────────
// 15. Audit trail is populated and clearable (archives, never deletes)
// ───────────────────────────────────────────────────────────────
test('audit trail records step lifecycle and clearAuditTrail archives', async () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.RECREATE, TARGETS);
  await engine.execute(plan, makeRecordingAdapter());
  const trail = engine.getAuditTrail();
  assert.ok(trail.length > 0);
  const events = trail.map((e) => e.event);
  assert.ok(events.includes('start'));
  assert.ok(events.includes('end'));
  assert.ok(events.some((e) => e === 'step:start'));
  const archived = engine.clearAuditTrail();
  assert.equal(archived.length, trail.length);
  assert.equal(engine.getAuditTrail().length, 0);
});

// ───────────────────────────────────────────────────────────────
// 16. describePlan returns bilingual output
// ───────────────────────────────────────────────────────────────
test('describePlan produces bilingual text when locale=both', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.CANARY, TARGETS);
  const txt = engine.describePlan(plan, 'both');
  assert.ok(/[\u0590-\u05FF]/.test(txt)); // Hebrew present
  assert.ok(/[A-Za-z]/.test(txt));        // English present
  assert.ok(txt.includes('Canary deployment'));
  assert.ok(txt.includes('פריסת קנרית'));
});

// ───────────────────────────────────────────────────────────────
// 17. progressReport shows X/Y steps and status in both languages
// ───────────────────────────────────────────────────────────────
test('progressReport returns bilingual percent when locale=both', async () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  const summary = await engine.execute(plan, makeRecordingAdapter());
  const report = engine.progressReport(plan, summary, 'both');
  assert.ok(report.includes('Progress:'));
  assert.ok(report.includes('התקדמות:'));
  assert.ok(report.includes('100%'));
});

// ───────────────────────────────────────────────────────────────
// 18. Custom gate override is respected
// ───────────────────────────────────────────────────────────────
test('per-plan gate overrides override defaults', async () => {
  const { engine } = makeEngine();
  const adapter = makeRecordingAdapter({
    healthCheck: async () => ({ errorRate: 0.05, latencyP95Ms: 100, cpu: 0.3 }),
  });
  // Default 0.02 would fail; tighten to 0.01 — still fails. Loosen to 0.10 — passes.
  const planStrict = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS, { gates: { maxErrorRate: 0.01 } });
  const s1 = await engine.execute(planStrict, adapter);
  assert.equal(s1.status, PLAN_STATUS.ROLLED_BACK);

  const planLoose = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS, { gates: { maxErrorRate: 0.10 } });
  const s2 = await engine.execute(planLoose, adapter);
  assert.equal(s2.status, PLAN_STATUS.PROMOTED);
});

// ───────────────────────────────────────────────────────────────
// 19. Null adapter works (missing methods → skipped)
// ───────────────────────────────────────────────────────────────
test('execute with empty adapter treats missing methods as skipped', async () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.RECREATE, TARGETS);
  const summary = await engine.execute(plan, {});
  assert.equal(summary.status, PLAN_STATUS.PROMOTED);
  assert.ok(summary.stepsExecuted.every((s) => s.status === 'ok'));
});

// ───────────────────────────────────────────────────────────────
// 20. buildNullAdapter helper works end-to-end
// ───────────────────────────────────────────────────────────────
test('buildNullAdapter returns a healthy adapter for smoke testing', async () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.CANARY, TARGETS);
  const summary = await engine.execute(plan, buildNullAdapter());
  assert.equal(summary.status, PLAN_STATUS.PROMOTED);
});

// ───────────────────────────────────────────────────────────────
// 21. Rollback failure keeps plan in FAILED state
// ───────────────────────────────────────────────────────────────
test('execute marks plan FAILED if rollback itself throws', async () => {
  const { engine } = makeEngine({ healthCheckRetries: 1 });
  const adapter = makeRecordingAdapter({
    healthCheck: async () => ({ errorRate: 1, latencyP95Ms: 50, cpu: 0.2 }),
    rollback: async () => { throw new Error('infra down'); },
  });
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  const summary = await engine.execute(plan, adapter);
  assert.equal(summary.status, PLAN_STATUS.FAILED);
  assert.equal(summary.rolledBack, false);
});

// ───────────────────────────────────────────────────────────────
// 22. HealthGateBreach carries bilingual structured context
// ───────────────────────────────────────────────────────────────
test('HealthGateBreach contains metric, threshold, and bilingual fields', () => {
  const err = new HealthGateBreach('errorRate', 0.25, 0.02, 'plan-s3');
  assert.equal(err.code, 'HEALTH_GATE_BREACH');
  assert.equal(err.context.metric, 'errorRate');
  assert.equal(err.context.threshold, 0.02);
  assert.ok(err.bilingual.en.includes('0.25'));
  assert.ok(err.bilingual.he.includes('שער'));
});

// ───────────────────────────────────────────────────────────────
// 23. Step ids are deterministic and monotonic
// ───────────────────────────────────────────────────────────────
test('plan step ids are monotonic and carry planId prefix', () => {
  const { engine } = makeEngine();
  const plan = engine.plan(STRATEGIES.BLUE_GREEN, TARGETS);
  plan.steps.forEach((s, i) => {
    assert.equal(s.index, i);
    assert.ok(s.stepId.startsWith(plan.planId));
    assert.ok(s.stepId.endsWith(`s${i + 1}`));
  });
});

// ───────────────────────────────────────────────────────────────
// 24. LABELS contain Hebrew glyphs for every strategy
// ───────────────────────────────────────────────────────────────
test('LABELS include Hebrew glyphs for every strategy and step kind', () => {
  for (const s of Object.values(STRATEGIES)) {
    assert.ok(LABELS[s], `missing label for strategy ${s}`);
    assert.ok(/[\u0590-\u05FF]/.test(LABELS[s].he));
    assert.ok(LABELS[s].en.length > 0);
  }
  for (const k of Object.values(STEP_KINDS)) {
    assert.ok(LABELS[k], `missing label for step kind ${k}`);
    assert.ok(/[\u0590-\u05FF]/.test(LABELS[k].he));
  }
});
