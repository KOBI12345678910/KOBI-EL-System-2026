/* ============================================================================
 * Techno-Kol ERP — synthetic-monitor test suite
 * Agent X-65 / Swarm 3D / Onyx Procurement
 * ----------------------------------------------------------------------------
 * Zero deps. Runs under plain Node —
 *   node test/payroll/synthetic-monitor.test.js
 *
 * Covers 22 cases:
 *   01 createMonitor returns expected API shape
 *   02 defineCanary — assigns id + defaults
 *   03 defineCanary — rejects missing fn / name
 *   04 runCanary — happy path, steps all ok
 *   05 runCanary — step failure propagates + produces error
 *   06 runCanary — duration > threshold marks success=false
 *   07 runCanary — unknown id throws
 *   08 runAll — summarises pass/fail/skipped counts
 *   09 maintenance mode — pauses canaries and records reason
 *   10 disabled canary — skipped with reason "disabled"
 *   11 test-data isolation — createTestData tags rows [canary]
 *   12 cleanup — canary-created rows are purged after each run
 *   13 screenshot stub — failure triggers snapshot capture
 *   14 locations — multi-location run produces one run per location
 *   15 built-in canaries — all 10 flows register + pass with fake client
 *   16 getHistory — returns circular buffer trimmed to historyKeep
 *   17 getAvailability — computes success percentage over period
 *   18 stats — aggregates per-canary + global success rate
 *   19 on('fail') listener — fires on flow failure
 *   20 setMaintenanceMode off — resumes execution
 *   21 Hebrew bilingual — canary name + alert text include Hebrew
 *   22 trace correlation — traceId is shared across all locations of one run
 * ========================================================================== */

'use strict';

const path = require('path');
const sm = require(path.join(__dirname, '..', '..', 'onyx-procurement', 'src', 'ops', 'synthetic-monitor.js'));

/* ----------------------------------------------------------------------------
 * Tiny assertion + harness (no deps)
 * -------------------------------------------------------------------------- */
const results = [];

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertFalse(cond, msg) {
  if (cond) throw new Error(msg || 'assertFalse failed');
}
function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || 'assertDeep'}: ${a} !== ${e}`);
}
function assertThrows(fn, msg) {
  try { fn(); }
  catch (_) { return; }
  throw new Error(msg || 'assertThrows: expected throw');
}
async function assertRejects(promise, msg) {
  try { await promise; }
  catch (_) { return; }
  throw new Error(msg || 'assertRejects: expected rejection');
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok  - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  FAIL- ${name}\n        ${err.message}`);
  }
}

/* ----------------------------------------------------------------------------
 * Fake clock — gives us deterministic "now" values for timing tests
 * -------------------------------------------------------------------------- */
function makeFakeClock() {
  let t = 1_700_000_000_000;
  const timers = [];
  const intervals = [];
  return {
    now:   () => t,
    tick:  (dt) => { t += dt; },
    setTimeout:  (fn, ms) => { const h = { fn, at: t + ms, cleared: false }; timers.push(h); return h; },
    clearTimeout: (h) => { if (h) h.cleared = true; },
    setInterval:  (fn, ms) => { const h = { fn, every: ms, cleared: false }; intervals.push(h); return h; },
    clearInterval: (h) => { if (h) h.cleared = true; },
    _timers: timers,
    _intervals: intervals,
  };
}

/* ----------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------- */

(async function run() {
  console.log('synthetic-monitor.test.js — 22 cases\n');

  // 01
  await test('01 createMonitor returns expected API shape', () => {
    const m = sm.createMonitor();
    assertTrue(typeof m.defineCanary === 'function');
    assertTrue(typeof m.runCanary === 'function');
    assertTrue(typeof m.runAll === 'function');
    assertTrue(typeof m.getHistory === 'function');
    assertTrue(typeof m.getAvailability === 'function');
    assertTrue(typeof m.stats === 'function');
    assertTrue(typeof m.setMaintenanceMode === 'function');
    assertTrue(typeof m.on === 'function');
    assertTrue(typeof m.registerBuiltInCanaries === 'function');
  });

  // 02
  await test('02 defineCanary — assigns id and defaults', () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({
      name: 'probe',
      fn: async (ctx) => { await ctx.step('noop', () => ({ ok: true })); },
    });
    assertTrue(typeof id === 'string' && id.indexOf('canary_') === 0);
    const c = m.getCanary(id);
    assertEq(c.name, 'probe');
    assertTrue(c.schedule > 0);
    assertTrue(c.threshold > 0);
    assertTrue(Array.isArray(c.locations) && c.locations.length >= 1);
    assertEq(c.enabled, true);
  });

  // 03
  await test('03 defineCanary — rejects missing fn / name', () => {
    const m = sm.createMonitor();
    assertThrows(() => m.defineCanary({ fn: () => {} }),   'needs name');
    assertThrows(() => m.defineCanary({ name: 'x' }),       'needs fn');
    assertThrows(() => m.defineCanary(null),                'needs def');
  });

  // 04
  await test('04 runCanary — happy path, steps all ok', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({
      name: 'happy',
      threshold: 100_000,
      fn: async (ctx) => {
        await ctx.step('step-a', () => 1);
        await ctx.step('step-b', () => 2);
      },
    });
    const res = await m.runCanary(id);
    assertTrue(res.success, 'should succeed, got ' + JSON.stringify(res));
    assertEq(res.runs.length, 1);
    assertEq(res.runs[0].steps.length, 2);
    for (const s of res.runs[0].steps) assertEq(s.status, 'ok');
  });

  // 05
  await test('05 runCanary — step failure produces error', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({
      name: 'broken',
      threshold: 100_000,
      fn: async (ctx) => {
        await ctx.step('bad', () => { throw new Error('kaboom'); });
      },
    });
    const res = await m.runCanary(id);
    assertFalse(res.success);
    assertTrue(res.error && /kaboom|failed/.test(res.error.message || ''), 'error should capture fail reason');
    const run = res.runs[0];
    assertEq(run.steps.length, 1);
    assertEq(run.steps[0].status, 'fail');
  });

  // 06
  await test('06 runCanary — duration > threshold marks success=false', async () => {
    const clock = makeFakeClock();
    const m = sm.createMonitor({ clock });
    const id = m.defineCanary({
      name: 'slow',
      threshold: 50,
      fn: async (ctx) => {
        await ctx.step('drift', () => { clock.tick(500); return 'done'; });
      },
    });
    const res = await m.runCanary(id);
    assertFalse(res.success, 'must fail on threshold breach');
    assertTrue(res.runs[0].overThreshold, 'overThreshold flag should be set');
    // Step itself succeeded, only the overall run busted the SLA
    assertEq(res.runs[0].steps[0].status, 'ok');
  });

  // 07
  await test('07 runCanary — unknown id throws', async () => {
    const m = sm.createMonitor();
    await assertRejects(m.runCanary('nope'));
  });

  // 08
  await test('08 runAll — summarises pass / fail / skipped counts', async () => {
    const m = sm.createMonitor();
    m.defineCanary({ name: 'a',  threshold: 100_000, fn: async (ctx) => { await ctx.step('x', () => 1); } });
    m.defineCanary({ name: 'b',  threshold: 100_000, fn: async (ctx) => { await ctx.step('x', () => { throw new Error('no'); }); } });
    const c = m.defineCanary({ name: 'c', threshold: 100_000, fn: async (ctx) => { await ctx.step('x', () => 1); } });
    m.disable(c);
    const summary = await m.runAll();
    assertEq(summary.total, 3);
    assertEq(summary.passed, 1);
    assertEq(summary.failed, 1);
    assertEq(summary.skipped, 1);
  });

  // 09
  await test('09 maintenance mode — pauses and records reason', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({ name: 'x', fn: async (ctx) => { await ctx.step('x', () => 1); } });
    m.setMaintenanceMode(true, 'deploy v1.2.3');
    assertTrue(m.isInMaintenance());
    assertEq(m.getMaintenanceReason(), 'deploy v1.2.3');
    const res = await m.runCanary(id);
    assertTrue(res.skipped);
    assertTrue(/maintenance/.test(res.reason));
  });

  // 10
  await test('10 disabled canary — skipped with reason "disabled"', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({ name: 'x', fn: async (ctx) => { await ctx.step('x', () => 1); } });
    m.disable(id);
    const res = await m.runCanary(id);
    assertTrue(res.skipped);
    assertEq(res.reason, 'disabled');
  });

  // 11
  await test('11 test-data isolation — createTestData tags rows [canary]', async () => {
    const m = sm.createMonitor();
    let captured = null;
    const id = m.defineCanary({
      name: 'iso',
      threshold: 100_000,
      fn: async (ctx) => {
        captured = ctx.createTestData('invoice', { total: 42 });
        await ctx.step('noop', () => 1);
      },
    });
    await m.runCanary(id);
    assertTrue(captured && captured._canary === true, 'rows must be marked _canary=true');
    assertEq(captured.canaryTag, '[canary]');
    assertEq(captured.total, 42);
  });

  // 12
  await test('12 cleanup — canary rows purged after run', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({
      name: 'cleanup',
      threshold: 100_000,
      fn: async (ctx) => {
        ctx.createTestData('a', {});
        ctx.createTestData('b', {});
        await ctx.step('noop', () => 1);
      },
    });
    await m.runCanary(id);
    assertEq(m.getCanaryCreatedRows().length, 0, 'created rows must be cleared after run');
  });

  // 13
  await test('13 screenshot stub — failure triggers snapshot', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({
      name: 'snap',
      threshold: 100_000,
      fn: async (ctx) => { await ctx.step('bad', () => { throw new Error('bang'); }); },
    });
    await m.runCanary(id);
    const shots = m.getScreenshotStubs();
    assertTrue(shots.length >= 1, 'should have captured at least one screenshot');
    assertEq(shots[0].canary, id);
    assertTrue(typeof shots[0].payload === 'string' && shots[0].payload.indexOf('<stub:screenshot') === 0);
  });

  // 14
  await test('14 locations — multi-location run produces one run per location', async () => {
    const m = sm.createMonitor();
    m.addLocation('eu-west', { region: 'EU' });
    m.addLocation('us-east', { region: 'US' });
    const id = m.defineCanary({
      name: 'multi',
      threshold: 100_000,
      locations: ['eu-west', 'us-east'],
      fn: async (ctx) => { await ctx.step('x', () => 1); },
    });
    const res = await m.runCanary(id);
    assertEq(res.runs.length, 2);
    const locs = res.runs.map((r) => r.location).sort();
    assertDeep(locs, ['eu-west', 'us-east']);
  });

  // 15
  await test('15 built-in canaries — 10 flows register and pass', async () => {
    const m = sm.createMonitor();
    const ids = m.registerBuiltInCanaries();
    assertEq(ids.length, 10, 'must register all 10 built-in canaries');
    const summary = await m.runAll();
    assertEq(summary.total, 10);
    assertEq(summary.failed, 0, 'all canaries should pass with the fake client, got: ' + JSON.stringify(summary));
    assertEq(summary.passed, 10);
  });

  // 16
  await test('16 getHistory — circular buffer trimmed to historyKeep', async () => {
    const m = sm.createMonitor({ historyKeep: 3 });
    const id = m.defineCanary({
      name: 'hx',
      threshold: 100_000,
      fn: async (ctx) => { await ctx.step('x', () => 1); },
    });
    for (let i = 0; i < 5; i++) {
      // eslint-disable-next-line no-await-in-loop
      await m.runCanary(id);
    }
    const runs = m.getHistory(id);
    assertEq(runs.length, 3, 'history must be bounded by historyKeep');
  });

  // 17
  await test('17 getAvailability — percentage over period', async () => {
    const m = sm.createMonitor();
    let fail = false;
    const id = m.defineCanary({
      name: 'flap',
      threshold: 100_000,
      fn: async (ctx) => {
        await ctx.step('x', () => { if (fail) throw new Error('down'); return 1; });
      },
    });
    await m.runCanary(id); // ok
    await m.runCanary(id); // ok
    fail = true;
    await m.runCanary(id); // fail
    await m.runCanary(id); // fail
    const avail = m.getAvailability(id);
    assertEq(avail, 50);
  });

  // 18
  await test('18 stats — per-canary + global success rate', async () => {
    const m = sm.createMonitor();
    const a = m.defineCanary({ name: 'a', threshold: 100_000, fn: async (ctx) => { await ctx.step('x', () => 1); } });
    const b = m.defineCanary({ name: 'b', threshold: 100_000, fn: async (ctx) => { await ctx.step('x', () => { throw new Error('fail'); }); } });
    await m.runCanary(a);
    await m.runCanary(b);
    const s = m.stats();
    assertEq(s.canaries, 2);
    assertEq(s.totalRuns, 2);
    assertEq(s.totalFailures, 1);
    assertEq(s.successRate, 50);
    assertTrue(s.perCanary[a] && s.perCanary[a].successRate === 100);
    assertTrue(s.perCanary[b] && s.perCanary[b].successRate === 0);
  });

  // 19
  await test('19 on("fail") listener — fires on flow failure', async () => {
    const m = sm.createMonitor();
    let fails = 0;
    m.on('fail', () => { fails += 1; });
    const id = m.defineCanary({
      name: 'x',
      threshold: 100_000,
      fn: async (ctx) => { await ctx.step('x', () => { throw new Error('ugh'); }); },
    });
    await m.runCanary(id);
    assertEq(fails, 1);
  });

  // 20
  await test('20 setMaintenanceMode off — resumes execution', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({ name: 'x', threshold: 100_000, fn: async (ctx) => { await ctx.step('x', () => 1); } });
    m.setMaintenanceMode(true, 'deploy');
    const r1 = await m.runCanary(id);
    assertTrue(r1.skipped);
    m.setMaintenanceMode(false);
    const r2 = await m.runCanary(id);
    assertTrue(r2.success, 'should run after maintenance off');
  });

  // 21
  await test('21 Hebrew bilingual — canary names + alert text', async () => {
    const m = sm.createMonitor();
    const id = m.defineCanary({
      name:    'heb',
      name_he: 'בדיקה עברית',
      name_en: 'Hebrew test',
      threshold: 100_000,
      fn: async (ctx) => { await ctx.step('x', () => 1); },
    });
    const c = m.getCanary(id);
    assertEq(c.name_he, 'בדיקה עברית');
    assertEq(c.name_en, 'Hebrew test');
    // Built-in canaries also carry HE/EN labels
    const defs = m.buildBuiltInCanaries();
    for (const d of defs) {
      assertTrue(typeof d.name_he === 'string' && d.name_he.length > 0, 'name_he required');
      assertTrue(typeof d.name_en === 'string' && d.name_en.length > 0, 'name_en required');
    }
  });

  // 22
  await test('22 trace correlation — traceId shared across locations', async () => {
    const m = sm.createMonitor();
    m.addLocation('eu-west');
    m.addLocation('us-east');
    const id = m.defineCanary({
      name: 'trace',
      threshold: 100_000,
      locations: ['eu-west', 'us-east'],
      fn: async (ctx) => { await ctx.step('x', () => 1); },
    });
    const res = await m.runCanary(id);
    assertEq(res.runs.length, 2);
    assertEq(res.runs[0].traceId, res.runs[1].traceId, 'same trace id for both locations');
    assertTrue(res.runs[0].traceId.indexOf('t_') === 0, 'trace id format');
  });

  /* ------------------------------------------------------------------------
   * Summary
   * ---------------------------------------------------------------------- */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${passed}/${results.length} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
