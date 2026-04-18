/**
 * autoscaler.test.js — unit suite for Agent Y-176 autoscaler.
 * Zero external test deps — uses `node:test` and `node:assert/strict`.
 *
 * Covers:
 *   - reactive scaling (CPU, memory, queue depth)
 *   - aggressive-up / conservative-down behaviour
 *   - min/max bound clamping
 *   - predictive linear-forecast upscale
 *   - schedule-based business-hours floor
 *   - Israeli bank holiday suppression
 *   - scale-up cooldown
 *   - scale-down cooldown
 *   - EventEmitter emissions
 *   - append-only ledger invariant
 *   - config validation
 *   - holiday append at runtime
 *   - plan() non-mutation
 *   - isBusinessHours / isHoliday introspection
 *   - bilingual reasons (Hebrew + English)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AutoScaler, DEFAULTS, ISRAELI_HOLIDAYS_2026 } = require('../../src/devops/autoscaler');

/* ------------------------------------------------------------------ *
 *  Fixture helpers                                                   *
 * ------------------------------------------------------------------ */

// A Saturday in Israel (Sat 2026-04-11 is in Pesach, but schedule-blocking
// Saturday fixture at noon works independently of holidays).
const SAT_NOON_2026 = Date.parse('2026-04-11T09:00:00Z'); // 12:00 Asia/Jerusalem
// A Sunday at 12:00 Jerusalem (business day, business hour).
const SUN_NOON_2026 = Date.parse('2026-04-12T09:00:00Z'); // 12:00 Asia/Jerusalem
// A Sunday at 06:00 Jerusalem (business day, OUTSIDE business hours).
const SUN_EARLY_2026 = Date.parse('2026-04-12T03:00:00Z'); // 06:00 Asia/Jerusalem
// Yom Kippur 2026 at 12:00 Jerusalem — holiday, must NOT apply schedule floor.
const YOM_KIPPUR_NOON = Date.parse('2026-09-22T09:00:00Z'); // 12:00 Asia/Jerusalem

function makeScaler(extra = {}) {
  return new AutoScaler({
    minReplicas: 1,
    maxReplicas: 20,
    initialReplicas: 2,
    scaleUpStep: 10,
    scaleDownStep: 1,
    scaleUpCooldownMs: 1000,
    scaleDownCooldownMs: 5000,
    now: () => SUN_EARLY_2026, // outside business hours → schedule inactive
    ...extra,
  });
}

/* ------------------------------------------------------------------ *
 *  1. Reactive CPU scale-up                                          *
 * ------------------------------------------------------------------ */

test('reactive scale-up when CPU exceeds target', () => {
  const as = makeScaler();
  as.recordMetric({ cpu: 140, memory: 40, queueDepth: 5 }); // 140% of 2 replicas
  const d = as.evaluate();
  assert.equal(d.applied, true);
  assert.equal(d.direction, 'up');
  // 2 * 140 / 70 = 4
  assert.equal(as.getReplicas(), 4);
  assert.equal(d.policy, 'reactive');
});

/* ------------------------------------------------------------------ *
 *  2. Reactive memory drives the decision                            *
 * ------------------------------------------------------------------ */

test('reactive scale-up driven by memory when memory is the hottest signal', () => {
  const as = makeScaler();
  as.recordMetric({ cpu: 50, memory: 150, queueDepth: 5 }); // 2 * 150 / 75 = 4
  const d = as.evaluate();
  assert.equal(d.applied, true);
  assert.equal(as.getReplicas(), 4);
  assert.match(d.reason, /memory|mem=/i);
  assert.match(d.reasonHe, /זיכרון/);
});

/* ------------------------------------------------------------------ *
 *  3. Reactive queue-depth drives the decision                       *
 * ------------------------------------------------------------------ */

test('reactive scale-up driven by queue depth', () => {
  const as = makeScaler({ targetQueueDepthPerReplica: 50 });
  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 400 }); // ceil(400/50) = 8
  const d = as.evaluate();
  assert.equal(d.applied, true);
  assert.equal(as.getReplicas(), 8);
  assert.match(d.reasonHe, /תור/);
});

/* ------------------------------------------------------------------ *
 *  4. Aggressive scale-up vs conservative scale-down                 *
 * ------------------------------------------------------------------ */

test('scale-up is aggressive (step of 10) and scale-down is conservative (step of 1)', () => {
  // up: start at 2, demand 12 → one step can go to 12 (step=10)
  const up = makeScaler();
  up.recordMetric({ cpu: 420, memory: 10, queueDepth: 0 }); // ceil(2*420/70)=12
  up.evaluate();
  assert.equal(up.getReplicas(), 12);

  // down: start at 10, demand 1 → single-step per evaluation
  const down = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 10,
    scaleUpStep: 10, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => SUN_EARLY_2026,
  });
  down.recordMetric({ cpu: 5, memory: 5, queueDepth: 0 });
  down.evaluate();
  assert.equal(down.getReplicas(), 9);
  down.recordMetric({ cpu: 5, memory: 5, queueDepth: 0 });
  down.evaluate();
  assert.equal(down.getReplicas(), 8);
});

/* ------------------------------------------------------------------ *
 *  5. Min / max bounds enforced                                      *
 * ------------------------------------------------------------------ */

test('min / max replica bounds are enforced and emit bounds-clamp events', () => {
  const as = new AutoScaler({
    minReplicas: 2, maxReplicas: 5, initialReplicas: 3,
    scaleUpStep: 100, scaleDownStep: 100,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => SUN_EARLY_2026,
  });
  const clampEvents = [];
  as.on('bounds-clamp', (e) => clampEvents.push(e));

  as.recordMetric({ cpu: 999, memory: 10, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 5, 'clamped at max');
  assert.ok(clampEvents.length >= 1);
  assert.equal(clampEvents[0].bound, 'max');

  as.recordMetric({ cpu: 1, memory: 1, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 2, 'clamped at min');
});

/* ------------------------------------------------------------------ *
 *  6. Predictive linear forecast upscale                             *
 * ------------------------------------------------------------------ */

test('predictive policy pre-scales when linear forecast projects overload', () => {
  const baseTs = SUN_EARLY_2026;
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 2,
    predictiveEnabled: true, predictiveWindowSize: 10,
    predictiveHorizonMs: 60_000, predictiveMinSamples: 4,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => baseTs + 10_000,
  });
  // rising slope: 30, 40, 50, 60 at t=0,1,2,3 seconds
  for (let i = 0; i < 4; i++) {
    as.recordMetric({ cpu: 30 + i * 10, memory: 10, queueDepth: 0, timestamp: baseTs + i * 1000 });
  }
  const d = as.evaluate();
  // reactive alone (last cpu=60) would NOT scale up (60 < 70)
  // predictive should project further rise and raise replicas
  assert.equal(d.policy === 'predictive' || d.policy === 'reactive', true);
  // Regardless of the driver label, predictive must have fired: replicas must exceed 2
  assert.ok(as.getReplicas() > 2, 'predictive forced pre-scale');
});

/* ------------------------------------------------------------------ *
 *  7. Predictive disabled = no forecast                              *
 * ------------------------------------------------------------------ */

test('predictive disabled: stays at initial replicas on a low-but-rising slope', () => {
  const baseTs = SUN_EARLY_2026;
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 2,
    predictiveEnabled: false,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => baseTs + 10_000,
  });
  for (let i = 0; i < 4; i++) {
    as.recordMetric({ cpu: 30 + i * 10, memory: 10, queueDepth: 0, timestamp: baseTs + i * 1000 });
  }
  as.evaluate();
  // last cpu = 60 < target 70 → reactive won't fire, predictive disabled
  assert.equal(as.getReplicas(), 2);
});

/* ------------------------------------------------------------------ *
 *  8. Schedule-based business-hours floor                            *
 * ------------------------------------------------------------------ */

test('schedule policy enforces business-hours floor on a Sunday at 12:00 Israel', () => {
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 1,
    scheduleEnabled: true, scheduleMinReplicas: 5,
    scheduleStartHour: 9, scheduleEndHour: 18,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => SUN_NOON_2026,
  });
  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 0 });
  const d = as.evaluate();
  assert.equal(as.getReplicas(), 5, 'schedule floor applied');
  assert.equal(d.policy, 'schedule');
  assert.match(d.reasonHe, /רצפת לו"ז/);
});

/* ------------------------------------------------------------------ *
 *  9. Schedule inactive outside hours                                *
 * ------------------------------------------------------------------ */

test('schedule policy does NOT fire outside 09:00-18:00', () => {
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 1,
    scheduleEnabled: true, scheduleMinReplicas: 5,
    scheduleStartHour: 9, scheduleEndHour: 18,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => SUN_EARLY_2026, // 06:00 Israel
  });
  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 1, 'no schedule floor at 06:00');
});

/* ------------------------------------------------------------------ *
 *  10. Holidays suppress schedule floor                              *
 * ------------------------------------------------------------------ */

test('Israeli bank holiday (Yom Kippur) suppresses schedule floor', () => {
  const holidayEvents = [];
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 1,
    scheduleEnabled: true, scheduleMinReplicas: 5,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => YOM_KIPPUR_NOON,
  });
  as.on('holiday', (h) => holidayEvents.push(h));
  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 1, 'no schedule floor on Yom Kippur');
  assert.ok(holidayEvents.length >= 1);
  assert.match(holidayEvents[0].nameHe, /יום כיפור/);
});

/* ------------------------------------------------------------------ *
 *  11. Saturday = closed (no schedule floor)                         *
 * ------------------------------------------------------------------ */

test('Saturday (Shabbat) is not a business day — no schedule floor', () => {
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 1,
    scheduleEnabled: true, scheduleMinReplicas: 5,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    now: () => SAT_NOON_2026,
    holidays: [], // disable holidays to isolate the Saturday rule
  });
  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 1);
});

/* ------------------------------------------------------------------ *
 *  12. Scale-up cooldown                                             *
 * ------------------------------------------------------------------ */

test('scale-up cooldown blocks consecutive upscales', () => {
  let t = SUN_EARLY_2026;
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 2,
    scaleUpStep: 50, scaleDownStep: 1,
    scaleUpCooldownMs: 10_000, scaleDownCooldownMs: 0,
    now: () => t,
  });
  as.recordMetric({ cpu: 200, memory: 10, queueDepth: 0 });
  as.evaluate();
  const first = as.getReplicas();
  assert.ok(first > 2);

  // Advance time by 1 second — still within cooldown
  t += 1000;
  const cooldownEvents = [];
  as.on('cooldown', (e) => cooldownEvents.push(e));
  as.recordMetric({ cpu: 400, memory: 10, queueDepth: 0 });
  const d = as.evaluate();
  assert.equal(d.applied, false);
  assert.equal(as.getReplicas(), first, 'blocked by cooldown');
  assert.ok(cooldownEvents.some((e) => e.direction === 'up'));

  // Advance past cooldown
  t += 20_000;
  as.recordMetric({ cpu: 400, memory: 10, queueDepth: 0 });
  as.evaluate();
  assert.ok(as.getReplicas() > first, 'scaled after cooldown');
});

/* ------------------------------------------------------------------ *
 *  13. Scale-down cooldown                                           *
 * ------------------------------------------------------------------ */

test('scale-down cooldown blocks consecutive downscales', () => {
  let t = SUN_EARLY_2026;
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 5,
    scaleUpStep: 10, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 60_000,
    now: () => t,
  });
  as.recordMetric({ cpu: 5, memory: 5, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 4);

  t += 1000;
  as.recordMetric({ cpu: 5, memory: 5, queueDepth: 0 });
  const d = as.evaluate();
  assert.equal(d.applied, false, 'down cooldown blocked');
  assert.equal(as.getReplicas(), 4);

  t += 120_000;
  as.recordMetric({ cpu: 5, memory: 5, queueDepth: 0 });
  as.evaluate();
  assert.equal(as.getReplicas(), 3);
});

/* ------------------------------------------------------------------ *
 *  14. EventEmitter emissions                                        *
 * ------------------------------------------------------------------ */

test('emits metric, decision, scale-up and no-change events', () => {
  const bag = { metric: 0, decision: 0, up: 0, down: 0, noop: 0 };
  // Use an explicit initialReplicas=1 with min=1 so a low-load sample
  // stays at 1 and produces a "no-change" event (no scale-down possible).
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 1,
    scaleUpStep: 10, scaleDownStep: 1,
    scaleUpCooldownMs: 0, scaleDownCooldownMs: 0,
    predictiveEnabled: false,
    scheduleEnabled: false,
    now: () => SUN_EARLY_2026,
  });
  as.on('metric', () => bag.metric++);
  as.on('decision', () => bag.decision++);
  as.on('scale-up', () => bag.up++);
  as.on('scale-down', () => bag.down++);
  as.on('no-change', () => bag.noop++);

  as.recordMetric({ cpu: 30, memory: 30, queueDepth: 0 });
  as.evaluate(); // no-change: reactive desired=1, current=1
  as.recordMetric({ cpu: 200, memory: 10, queueDepth: 0 });
  as.evaluate(); // up

  assert.equal(bag.metric, 2);
  assert.equal(bag.decision, 2);
  assert.ok(bag.up >= 1);
  assert.ok(bag.noop >= 1);
});

/* ------------------------------------------------------------------ *
 *  15. Append-only ledger invariant                                  *
 * ------------------------------------------------------------------ */

test('ledgers are append-only — previous entries survive new evaluations', () => {
  const as = makeScaler();
  as.recordMetric({ cpu: 120, memory: 10, queueDepth: 0 });
  as.evaluate();
  const snapshot = {
    metrics: as.getMetrics().length,
    decisions: as.getDecisions().length,
    actions: as.getActions().length,
    events: as.getEvents().length,
  };
  // run more cycles
  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 0 });
  as.evaluate();

  assert.ok(as.getMetrics().length > snapshot.metrics);
  assert.ok(as.getDecisions().length > snapshot.decisions);
  // class has no public clear / reset / delete
  assert.equal(typeof as.clear, 'undefined');
  assert.equal(typeof as.reset, 'undefined');
  assert.equal(typeof as.delete, 'undefined');
});

/* ------------------------------------------------------------------ *
 *  16. Config validation                                             *
 * ------------------------------------------------------------------ */

test('constructor rejects invalid bounds', () => {
  assert.throws(() => new AutoScaler({ minReplicas: -1 }), /minReplicas/);
  assert.throws(() => new AutoScaler({ minReplicas: 10, maxReplicas: 5 }), /maxReplicas/);
  assert.throws(() => new AutoScaler({ targetCpuPct: 0 }), /targetCpuPct/);
  assert.throws(() => new AutoScaler({ targetMemoryPct: 200 }), /targetMemoryPct/);
});

/* ------------------------------------------------------------------ *
 *  17. recordMetric empty-sample rejection                           *
 * ------------------------------------------------------------------ */

test('recordMetric rejects a sample with no numeric signals', () => {
  const as = makeScaler();
  assert.throws(() => as.recordMetric({}), /at least one numeric/);
  assert.throws(() => as.recordMetric({ cpu: 'high' }), /at least one numeric/);
});

/* ------------------------------------------------------------------ *
 *  18. addHoliday at runtime                                         *
 * ------------------------------------------------------------------ */

test('addHoliday adds a new holiday without deleting existing ones', () => {
  const as = new AutoScaler({
    minReplicas: 1, maxReplicas: 20, initialReplicas: 1,
    scheduleEnabled: true, scheduleMinReplicas: 5,
    now: () => Date.parse('2026-06-01T09:00:00Z'),
  });
  const before = as.getConfig().holidays.length;
  // 2026-06-01 is a Monday — we want to mark it as a new company holiday
  as.addHoliday({ date: '2026-06-01', name: 'Company Day', nameHe: 'יום החברה' });
  assert.equal(as.getConfig().holidays.length, before + 1);

  as.recordMetric({ cpu: 10, memory: 10, queueDepth: 0 });
  as.evaluate();
  // Holiday should suppress the schedule floor
  assert.equal(as.getReplicas(), 1);
});

/* ------------------------------------------------------------------ *
 *  19. plan() is non-mutating                                        *
 * ------------------------------------------------------------------ */

test('plan() returns a what-if decision without mutating state', () => {
  const as = makeScaler();
  const r0 = as.getReplicas();
  const m0 = as.getMetrics().length;
  const d0 = as.getDecisions().length;

  const plan = as.plan({ metric: { cpu: 500, memory: 10, queueDepth: 0 } });
  assert.ok(plan.target > r0, 'plan shows hypothetical scale-up');
  assert.equal(as.getReplicas(), r0, 'actual replicas unchanged');
  assert.equal(as.getMetrics().length, m0, 'metric ledger unchanged');
  assert.equal(as.getDecisions().length, d0, 'decision ledger unchanged');
});

/* ------------------------------------------------------------------ *
 *  20. isBusinessHours / isHoliday introspection                     *
 * ------------------------------------------------------------------ */

test('isBusinessHours and isHoliday introspection helpers', () => {
  const as = new AutoScaler();
  assert.equal(as.isBusinessHours(SUN_NOON_2026), true);
  assert.equal(as.isBusinessHours(SUN_EARLY_2026), false);
  assert.equal(as.isBusinessHours(SAT_NOON_2026), false);
  assert.equal(as.isHoliday(YOM_KIPPUR_NOON), true);
});

/* ------------------------------------------------------------------ *
 *  21. Bilingual reasons                                             *
 * ------------------------------------------------------------------ */

test('every decision carries both English and Hebrew reasons', () => {
  const as = makeScaler();
  as.recordMetric({ cpu: 200, memory: 10, queueDepth: 0 });
  const d = as.evaluate();
  assert.equal(typeof d.reason, 'string');
  assert.equal(typeof d.reasonHe, 'string');
  assert.ok(d.reason.length > 0);
  assert.ok(d.reasonHe.length > 0);
  // Hebrew text should contain at least one Hebrew letter
  assert.match(d.reasonHe, /[\u0590-\u05FF]/);
});

/* ------------------------------------------------------------------ *
 *  22. ISRAELI_HOLIDAYS_2026 export is frozen                        *
 * ------------------------------------------------------------------ */

test('ISRAELI_HOLIDAYS_2026 export is non-empty and frozen', () => {
  assert.ok(Array.isArray(ISRAELI_HOLIDAYS_2026));
  assert.ok(ISRAELI_HOLIDAYS_2026.length >= 10);
  assert.equal(Object.isFrozen(ISRAELI_HOLIDAYS_2026), true);
  const yk = ISRAELI_HOLIDAYS_2026.find((h) => h.name === 'Yom Kippur');
  assert.ok(yk);
  assert.equal(yk.nameHe, 'יום כיפור');
});

/* ------------------------------------------------------------------ *
 *  23. DEFAULTS export shape                                         *
 * ------------------------------------------------------------------ */

test('DEFAULTS export contains expected HPA, predictive and schedule keys', () => {
  assert.equal(typeof DEFAULTS, 'object');
  for (const key of [
    'minReplicas', 'maxReplicas', 'targetCpuPct', 'targetMemoryPct',
    'targetQueueDepthPerReplica', 'scaleUpStep', 'scaleDownStep',
    'scaleUpCooldownMs', 'scaleDownCooldownMs',
    'predictiveEnabled', 'predictiveWindowSize', 'predictiveHorizonMs',
    'scheduleEnabled', 'scheduleStartHour', 'scheduleEndHour',
    'scheduleMinReplicas', 'businessDays', 'holidays',
  ]) {
    assert.ok(key in DEFAULTS, `DEFAULTS missing ${key}`);
  }
});
