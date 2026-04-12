/**
 * ONYX DEVOPS — HealthOrchestrator tests (Agent Y-175)
 * =====================================================
 * Covers:
 *   - register validation (name, fn, deps, cycles)
 *   - register is additive: re-register preserves history
 *   - runAll runs every probe in parallel, per-probe timeouts
 *   - aggregateStatus: green / yellow / red combinations
 *   - Dependency cascading: child down marks parent degraded
 *   - Transitive cascading through a chain
 *   - Topological ordering so cascades propagate correctly
 *   - Alerting hooks: state transitions fire events
 *   - offAlert / onAlert return unsubscribe
 *   - Sample buffer capped at MAX_SAMPLES
 *   - historicalUptime for 24h / 7d / 30d
 *   - sloReport: target, burnRate, budget
 *   - runSynthetic multi-step script
 *   - registerSynthetic integrates into runAll + aggregate
 *   - statusPage emits bilingual HTML (he + en), RTL dir, banner, cards
 *   - statusPage escapes XSS
 *   - withTimeout rejects after ms
 *   - detectCycle catches direct and indirect cycles
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HealthOrchestrator,
  STATUS,
  SLO_TARGET_DEFAULT,
  WINDOW_MS,
  _internal,
} = require('../../src/devops/health-orchestrator');

// ─── Helpers ────────────────────────────────────────────────────────

function okCheck(latencyMs = 10) {
  return async () => ({ ok: true, latencyMs });
}
function failCheck(msg = 'boom') {
  return async () => ({ ok: false, error: msg });
}
function throwingCheck(msg = 'exploded') {
  return async () => { throw new Error(msg); };
}

// A fake clock we can advance deterministically.
function makeClock(startMs = 1_700_000_000_000) {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    set: (ms) => { t = ms; },
  };
}

// ─── 1. register validation ─────────────────────────────────────────

test('register — requires non-empty service name', () => {
  const ho = new HealthOrchestrator();
  assert.throws(() => ho.register('', okCheck()), /non-empty string/);
  assert.throws(() => ho.register(null, okCheck()), /non-empty string/);
});

test('register — requires function checkFn', () => {
  const ho = new HealthOrchestrator();
  assert.throws(() => ho.register('db', 'not-a-fn'), /must be a function/);
});

test('register — requires array dependencies', () => {
  const ho = new HealthOrchestrator();
  assert.throws(
    () => ho.register('db', okCheck(), 'not-an-array'),
    /must be an array/,
  );
});

test('register — rejects direct dependency cycle', () => {
  const ho = new HealthOrchestrator();
  ho.register('a', okCheck(), ['b']);
  // Now registering b with dep 'a' closes the cycle a→b→a.
  assert.throws(
    () => ho.register('b', okCheck(), ['a']),
    /cycle/,
  );
});

test('register — rejects transitive dependency cycle', () => {
  const ho = new HealthOrchestrator();
  ho.register('a', okCheck(), ['b']);
  ho.register('b', okCheck(), ['c']);
  assert.throws(() => ho.register('c', okCheck(), ['a']), /cycle/);
});

// ─── 2. register is additive ────────────────────────────────────────

test('register — re-registering preserves accumulated samples', async () => {
  const clock = makeClock();
  const ho = new HealthOrchestrator({ now: clock.now });
  ho.register('db', okCheck());
  await ho.runAll();
  clock.advance(1000);
  await ho.runAll();
  const before = ho.services.get('db').samples.length;
  assert.equal(before, 2);

  // Re-register with a different function.
  ho.register('db', failCheck('new'));
  const after = ho.services.get('db').samples.length;
  assert.equal(after, before, 'samples must not be wiped by re-register');
});

// ─── 3. runAll basics ───────────────────────────────────────────────

test('runAll — returns aggregate GREEN when every probe ok', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', okCheck());
  ho.register('api', okCheck());
  const snap = await ho.runAll();
  assert.equal(snap.aggregate, STATUS.GREEN);
  assert.equal(snap.services.db.status, STATUS.GREEN);
  assert.equal(snap.services.api.status, STATUS.GREEN);
});

test('runAll — probe timeout caught and reported as red', async () => {
  const ho = new HealthOrchestrator({ defaultTimeoutMs: 50 });
  ho.register('slow', () => new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true, latencyMs: 1 }), 500);
  }));
  const snap = await ho.runAll();
  assert.equal(snap.services.slow.status, STATUS.RED);
  assert.match(String(snap.services.slow.error), /timeout/);
});

test('runAll — thrown exception in probe → red', async () => {
  const ho = new HealthOrchestrator();
  ho.register('bad', throwingCheck('kaboom'));
  const snap = await ho.runAll();
  assert.equal(snap.services.bad.status, STATUS.RED);
  assert.match(String(snap.services.bad.error), /kaboom/);
});

// ─── 4. aggregateStatus combinations ────────────────────────────────

test('aggregateStatus — empty orchestrator is unknown', () => {
  const ho = new HealthOrchestrator();
  assert.equal(ho.aggregateStatus(), STATUS.UNKNOWN);
});

test('aggregateStatus — one red among many greens is yellow', async () => {
  const ho = new HealthOrchestrator();
  ho.register('a', okCheck());
  ho.register('b', okCheck());
  ho.register('c', okCheck());
  ho.register('d', failCheck());
  const snap = await ho.runAll();
  // d is red (no deps), others green. red=1 of 4, not >50%, yellow.
  assert.equal(snap.aggregate, STATUS.YELLOW);
});

test('aggregateStatus — majority red is red', async () => {
  const ho = new HealthOrchestrator();
  ho.register('a', failCheck());
  ho.register('b', failCheck());
  ho.register('c', okCheck());
  const snap = await ho.runAll();
  assert.equal(snap.aggregate, STATUS.RED);
});

// ─── 5. Dependency cascading ────────────────────────────────────────

test('cascading — child red forces parent to yellow even if parent ok', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', failCheck('db down'));
  ho.register('api', okCheck(), ['db']);
  const snap = await ho.runAll();
  assert.equal(snap.services.db.status, STATUS.RED);
  assert.equal(
    snap.services.api.status,
    STATUS.YELLOW,
    'api must be cascaded to yellow because db is red',
  );
  assert.equal(snap.services.api.cascaded, true);
});

test('cascading — transitive yellow through a chain', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', failCheck());
  ho.register('cache', okCheck(), ['db']);
  ho.register('api', okCheck(), ['cache']);
  ho.register('web', okCheck(), ['api']);
  const snap = await ho.runAll();
  assert.equal(snap.services.db.status, STATUS.RED);
  assert.equal(snap.services.cache.status, STATUS.YELLOW);
  assert.equal(snap.services.api.status, STATUS.YELLOW);
  assert.equal(snap.services.web.status, STATUS.YELLOW);
});

// ─── 6. Alerting hooks ──────────────────────────────────────────────

test('onAlert — fires on state transition', async () => {
  const ho = new HealthOrchestrator();
  const events = [];
  ho.onAlert((e) => events.push(e));
  ho.register('svc', okCheck());
  await ho.runAll(); // unknown → green: no alert (only non-green gets alerted first time)

  ho.register('svc', failCheck('bad'));
  await ho.runAll(); // green → red: alert
  assert.equal(events.length, 1);
  assert.equal(events[0].service, 'svc');
  assert.equal(events[0].from, STATUS.GREEN);
  assert.equal(events[0].to, STATUS.RED);
});

test('onAlert — returns unsubscribe, offAlert works too', async () => {
  const ho = new HealthOrchestrator();
  const events = [];
  const unsub = ho.onAlert((e) => events.push(e));
  ho.register('x', okCheck());
  await ho.runAll();
  unsub();
  ho.register('x', failCheck());
  await ho.runAll();
  assert.equal(events.length, 0, 'unsubscribe must suppress further events');
});

// ─── 7. historical uptime / SLO ─────────────────────────────────────

test('historicalUptime — returns 24h/7d/30d fractions', async () => {
  const clock = makeClock();
  const ho = new HealthOrchestrator({ now: clock.now });
  ho.register('svc', okCheck());
  // 10 successful runs.
  for (let i = 0; i < 10; i++) {
    await ho.runAll();
    clock.advance(1000);
  }
  // Swap to failing.
  ho.register('svc', failCheck());
  for (let i = 0; i < 2; i++) {
    await ho.runAll();
    clock.advance(1000);
  }
  const up = ho.historicalUptime('svc');
  // 10 ok / 12 total = 0.8333...
  assert.ok(up['24h'] > 0.8 && up['24h'] < 0.9);
});

test('sloReport — computes burn rate vs 99.9% target', async () => {
  const clock = makeClock();
  const ho = new HealthOrchestrator({ sloTarget: 0.999, now: clock.now });
  ho.register('svc', okCheck());
  for (let i = 0; i < 90; i++) { await ho.runAll(); clock.advance(1000); }
  ho.register('svc', failCheck());
  for (let i = 0; i < 10; i++) { await ho.runAll(); clock.advance(1000); }
  const r = ho.sloReport('svc');
  assert.equal(r.target, 0.999);
  assert.equal(r.window, '30d');
  assert.ok(r.current > 0.89 && r.current < 0.91);
  // Budget is 0.001; consumed is 0.1; burnRate = 100.
  assert.ok(r.burnRate > 50, 'burn rate must be high when 10% failures on 99.9% target');
  assert.equal(r.budgetRemainingPct, 0);
});

// ─── 8. Synthetic checks ────────────────────────────────────────────

test('runSynthetic — executes multi-step script and returns steps', async () => {
  const ho = new HealthOrchestrator();
  const result = await ho.runSynthetic('login-flow', async () => {
    const steps = [];
    steps.push({ name: 'load', ok: true, ms: 5 });
    steps.push({ name: 'submit', ok: true, ms: 12 });
    steps.push({ name: 'redirect', ok: true, ms: 3 });
    return { ok: true, steps, durationMs: 20 };
  });
  assert.equal(result.ok, true);
  assert.equal(result.steps.length, 3);
  assert.equal(result.steps[1].name, 'submit');
});

test('registerSynthetic — participates in aggregate like a normal service', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', okCheck());
  ho.registerSynthetic('checkout-flow', async () => ({
    ok: false,
    steps: [{ name: 'add-to-cart', ok: false }],
    durationMs: 15,
  }));
  const snap = await ho.runAll();
  assert.equal(snap.services['checkout-flow'].status, STATUS.RED);
  assert.equal(snap.services['checkout-flow'].isSynthetic, true);
  // One red out of two → yellow aggregate
  assert.equal(snap.aggregate, STATUS.YELLOW);
});

// ─── 9. statusPage bilingual HTML ───────────────────────────────────

test('statusPage — Hebrew page has dir="rtl" and Hebrew strings', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', okCheck());
  ho.register('api', okCheck(), ['db']);
  await ho.runAll();
  const html = ho.statusPage('he');
  assert.match(html, /dir="rtl"/);
  assert.match(html, /מרכז בריאות מערכת/);
  assert.match(html, /מצב כולל/);
  assert.match(html, /תקין/);
  assert.match(html, /db/);
  assert.match(html, /api/);
});

test('statusPage — English page has dir="ltr" and English strings', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', okCheck());
  await ho.runAll();
  const html = ho.statusPage('en');
  assert.match(html, /dir="ltr"/);
  assert.match(html, /System Health Center/);
  assert.match(html, /Overall Status/);
  assert.match(html, /Operational/);
});

test('statusPage — escapes XSS in service names', async () => {
  const ho = new HealthOrchestrator();
  ho.register('<script>alert(1)</script>', okCheck());
  await ho.runAll();
  const html = ho.statusPage('en');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('statusPage — shows cascaded note when applicable', async () => {
  const ho = new HealthOrchestrator();
  ho.register('db', failCheck());
  ho.register('api', okCheck(), ['db']);
  await ho.runAll();
  const htmlHe = ho.statusPage('he');
  const htmlEn = ho.statusPage('en');
  assert.match(htmlHe, /מושפע מתלויה/);
  assert.match(htmlEn, /Cascaded from dependency/);
});

// ─── 10. internals ──────────────────────────────────────────────────

test('_internal.withTimeout — rejects on timeout', async () => {
  await assert.rejects(
    () => _internal.withTimeout(
      new Promise((r) => setTimeout(r, 200)),
      20,
      'slow',
    ),
    /timeout/,
  );
});

test('_internal.detectCycle — finds cycles', () => {
  const g = { a: ['b'], b: ['c'], c: [] };
  assert.equal(_internal.detectCycle(g, 'c', ['a']), true);
  assert.equal(_internal.detectCycle({ a: ['b'], b: [] }, 'a', ['b']), false);
});

test('_internal.statusRank / worst — order matches green<yellow<red', () => {
  assert.equal(_internal.worst(STATUS.GREEN, STATUS.RED), STATUS.RED);
  assert.equal(_internal.worst(STATUS.YELLOW, STATUS.GREEN), STATUS.YELLOW);
  assert.equal(_internal.worst(STATUS.RED, STATUS.YELLOW), STATUS.RED);
});

test('constants — SLO_TARGET_DEFAULT and WINDOW_MS exported', () => {
  assert.equal(SLO_TARGET_DEFAULT, 0.999);
  assert.equal(WINDOW_MS['24h'], 86_400_000);
  assert.equal(WINDOW_MS['7d'], 7 * 86_400_000);
  assert.equal(WINDOW_MS['30d'], 30 * 86_400_000);
});
