/**
 * ONYX JOBS — scheduler unit tests (node --test)
 *
 * Coverage:
 *   - parseCronExpression: every-N, ranges, lists, bounds, DOW normalisation
 *   - cronMatches: basic match + POSIX DOM/DOW OR semantics
 *   - computeNextRun: several canonical expressions
 *   - scheduler.register / list / get / pause / resume / runNow
 *   - overlap skip: the second tick is counted as `overlapped`
 *   - retry: handler that fails N-1 times then succeeds
 *   - timeout: handler that hangs is rejected after timeout
 *   - catch-up: readLastRuns → runs a missed job once with mode='catchup'
 *   - persistence: writeRun / readLastRuns roundtrip (tmp file)
 *   - registerAdminRoutes: all endpoints respond (with a fake Express app)
 *
 * Runs via `node --test src/jobs/scheduler.test.js`.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createScheduler,
  parseCronExpression,
  cronMatches,
  computeNextRun,
} = require('./scheduler');

const { createJsonlPersistence } = require('./persistence');

// ─────────────────────────────────────────────────────────────────
// PARSER
// ─────────────────────────────────────────────────────────────────

test('parseCronExpression: wildcard', () => {
  const p = parseCronExpression('* * * * *');
  assert.equal(p.fields.length, 5);
  assert.equal(p.fields[0].size, 60);
  assert.equal(p.fields[1].size, 24);
  assert.equal(p.fields[2].size, 31);
  assert.equal(p.fields[3].size, 12);
  assert.equal(p.fields[4].size, 7);
});

test('parseCronExpression: every-15-minutes "*/15 * * * *"', () => {
  const p = parseCronExpression('*/15 * * * *');
  assert.deepEqual(Array.from(p.fields[0]).sort((a, b) => a - b), [0, 15, 30, 45]);
});

test('parseCronExpression: ranged step "10-50/10 * * * *"', () => {
  const p = parseCronExpression('10-50/10 * * * *');
  assert.deepEqual(Array.from(p.fields[0]).sort((a, b) => a - b), [10, 20, 30, 40, 50]);
});

test('parseCronExpression: list "0,15,30,45 * * * *"', () => {
  const p = parseCronExpression('0,15,30,45 * * * *');
  assert.deepEqual(Array.from(p.fields[0]).sort((a, b) => a - b), [0, 15, 30, 45]);
});

test('parseCronExpression: Jan+Apr+Jul+Oct quarters', () => {
  const p = parseCronExpression('0 8 1 1,4,7,10 *');
  assert.deepEqual(Array.from(p.fields[3]).sort((a, b) => a - b), [1, 4, 7, 10]);
});

test('parseCronExpression: DOW 7 normalised to 0 (Sunday)', () => {
  const p = parseCronExpression('0 3 * * 7');
  assert.equal(p.fields[4].has(0), true);
  assert.equal(p.fields[4].has(7), false);
});

test('parseCronExpression: "0 0 * * 1" (Monday 00:00)', () => {
  const p = parseCronExpression('0 0 * * 1');
  assert.equal(p.fields[0].has(0), true);
  assert.equal(p.fields[1].has(0), true);
  assert.equal(p.fields[4].has(1), true);
});

test('parseCronExpression: errors on bad arity', () => {
  assert.throws(() => parseCronExpression('* * * *'), /5 fields/);
  assert.throws(() => parseCronExpression(''), /empty/);
  assert.throws(() => parseCronExpression(null), /string/);
});

test('parseCronExpression: errors on out-of-range', () => {
  assert.throws(() => parseCronExpression('60 * * * *'), /out of range/);
  assert.throws(() => parseCronExpression('0 24 * * *'), /out of range/);
  assert.throws(() => parseCronExpression('0 0 32 * *'), /out of range/);
  assert.throws(() => parseCronExpression('0 0 * 13 *'), /out of range/);
});

test('parseCronExpression: errors on bad range / step', () => {
  assert.throws(() => parseCronExpression('10-5 * * * *'), /range end/);
  assert.throws(() => parseCronExpression('*/0 * * * *'), /invalid step/);
});

// ─────────────────────────────────────────────────────────────────
// MATCH
// ─────────────────────────────────────────────────────────────────

test('cronMatches: literal minute/hour', () => {
  const p = parseCronExpression('0 2 * * *');
  assert.equal(cronMatches(p, new Date(2026, 3, 11, 2, 0)), true);
  assert.equal(cronMatches(p, new Date(2026, 3, 11, 2, 1)), false);
  assert.equal(cronMatches(p, new Date(2026, 3, 11, 3, 0)), false);
});

test('cronMatches: */5 matches 00,05,10,...', () => {
  const p = parseCronExpression('*/5 * * * *');
  for (let m = 0; m < 60; m++) {
    const d = new Date(2026, 3, 11, 12, m);
    assert.equal(cronMatches(p, d), m % 5 === 0, `minute ${m}`);
  }
});

test('cronMatches: POSIX DOM|DOW OR semantics', () => {
  // "fire on the 1st OR on Sunday" — restricted in BOTH fields
  const p = parseCronExpression('0 8 1 * 0');
  // April 1 2026 is a Wednesday → matches via DOM
  assert.equal(cronMatches(p, new Date(2026, 3, 1, 8, 0)), true);
  // April 5 2026 is a Sunday → matches via DOW
  assert.equal(cronMatches(p, new Date(2026, 3, 5, 8, 0)), true);
  // April 2 2026 is a Thursday, not the 1st → no match
  assert.equal(cronMatches(p, new Date(2026, 3, 2, 8, 0)), false);
});

// ─────────────────────────────────────────────────────────────────
// NEXT RUN
// ─────────────────────────────────────────────────────────────────

test('computeNextRun: daily 02:00 from noon → next day 02:00', () => {
  const p = parseCronExpression('0 2 * * *');
  const from = new Date(2026, 3, 11, 12, 0);
  const next = computeNextRun(p, from);
  assert.equal(next.getHours(), 2);
  assert.equal(next.getMinutes(), 0);
  assert.equal(next.getDate(), 12);
});

test('computeNextRun: daily 02:00 from 01:59 → same day 02:00', () => {
  const p = parseCronExpression('0 2 * * *');
  const from = new Date(2026, 3, 11, 1, 59);
  const next = computeNextRun(p, from);
  assert.equal(next.getDate(), 11);
  assert.equal(next.getHours(), 2);
});

test('computeNextRun: quarterly 08:00 from Feb → April 1', () => {
  const p = parseCronExpression('0 8 1 1,4,7,10 *');
  const from = new Date(2026, 1, 15, 10, 0); // Feb 15, 2026
  const next = computeNextRun(p, from);
  assert.equal(next.getMonth(), 3); // April
  assert.equal(next.getDate(), 1);
  assert.equal(next.getHours(), 8);
});

test('computeNextRun: */15 from 12:07 → 12:15', () => {
  const p = parseCronExpression('*/15 * * * *');
  const from = new Date(2026, 3, 11, 12, 7);
  const next = computeNextRun(p, from);
  assert.equal(next.getHours(), 12);
  assert.equal(next.getMinutes(), 15);
});

test('computeNextRun: Monday 00:00 from Tuesday noon → next Monday 00:00', () => {
  const p = parseCronExpression('0 0 * * 1');
  // April 14 2026 is a Tuesday
  const from = new Date(2026, 3, 14, 12, 0);
  const next = computeNextRun(p, from);
  assert.equal(next.getDay(), 1); // Monday
  assert.equal(next.getHours(), 0);
});

// ─────────────────────────────────────────────────────────────────
// SCHEDULER: runNow, retries, timeout, overlap, pause
// ─────────────────────────────────────────────────────────────────

test('scheduler.register + list + get + pause/resume', () => {
  const sched = createScheduler();
  sched.register({
    id: 'nop',
    cron: '*/5 * * * *',
    handler: async () => {},
  });
  const list = sched.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'nop');
  assert.equal(sched.get('nop').id, 'nop');
  assert.equal(sched.get('missing'), null);

  assert.equal(sched.pause('nop'), true);
  assert.equal(sched.get('nop').paused, true);
  assert.equal(sched.resume('nop'), true);
  assert.equal(sched.get('nop').paused, false);

  assert.equal(sched.pause('missing'), false);
});

test('scheduler.runNow: success path', async () => {
  const sched = createScheduler();
  let called = 0;
  sched.register({
    id: 'ok',
    cron: '*/5 * * * *',
    handler: async () => { called += 1; },
  });
  const r = await sched.runNow('ok');
  assert.equal(r.status, 'success');
  assert.equal(called, 1);
  assert.equal(sched.get('ok').lastStatus, 'success');
  assert.equal(sched.get('ok').successRuns, 1);
});

test('scheduler.runNow: retries + eventual success', async () => {
  const sched = createScheduler();
  let calls = 0;
  sched.register({
    id: 'flaky',
    cron: '*/5 * * * *',
    retries: 2,
    retryDelayMs: 1,
    handler: async () => {
      calls += 1;
      if (calls < 3) throw new Error('nope');
    },
  });
  const r = await sched.runNow('flaky');
  assert.equal(r.status, 'success');
  assert.equal(calls, 3);
});

test('scheduler.runNow: retries exhausted → failure', async () => {
  const sched = createScheduler();
  sched.register({
    id: 'broken',
    cron: '*/5 * * * *',
    retries: 1,
    retryDelayMs: 1,
    handler: async () => { throw new Error('always fails'); },
  });
  const r = await sched.runNow('broken');
  assert.equal(r.status, 'failure');
  assert.match(r.error, /always fails/);
  assert.equal(sched.get('broken').failureRuns, 1);
});

test('scheduler.runNow: handler timeout rejected', async () => {
  const sched = createScheduler();
  sched.register({
    id: 'slow',
    cron: '*/5 * * * *',
    timeout: 25,
    retries: 0,
    handler: () => new Promise(() => {}), // never resolves
  });
  const r = await sched.runNow('slow');
  assert.equal(r.status, 'failure');
  assert.match(r.error, /timed out/);
});

test('scheduler.runNow: overlap skip', async () => {
  const sched = createScheduler();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  sched.register({
    id: 'long',
    cron: '*/5 * * * *',
    retries: 0,
    handler: async () => { await gate; },
  });
  const first = sched.runNow('long'); // starts and awaits the gate
  // Allow first to set entry.running = true
  await new Promise(r => setImmediate(r));
  const second = await sched.runNow('long');
  assert.equal(second.status, 'skipped');
  release();
  await first;
  assert.equal(sched.get('long').overlapped, 1);
});

test('scheduler.runNow: unknown id throws', async () => {
  const sched = createScheduler();
  await assert.rejects(() => sched.runNow('nope'), /unknown job id/);
});

test('scheduler.register: duplicate id rejected', () => {
  const sched = createScheduler();
  sched.register({ id: 'a', cron: '* * * * *', handler: async () => {} });
  assert.throws(
    () => sched.register({ id: 'a', cron: '* * * * *', handler: async () => {} }),
    /duplicate/
  );
});

test('scheduler.register: validation', () => {
  const sched = createScheduler();
  assert.throws(() => sched.register({}), /id/);
  assert.throws(() => sched.register({ id: 'x' }), /cron/);
  assert.throws(() => sched.register({ id: 'x', cron: '* * * * *' }), /handler/);
});

// ─────────────────────────────────────────────────────────────────
// PERSISTENCE
// ─────────────────────────────────────────────────────────────────

test('persistence: writeRun + readLastRuns roundtrip', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-jobs-'));
  const file = path.join(tmp, 'job-runs.jsonl');
  const p = createJsonlPersistence({ file });

  p.writeRun({
    jobId: 'a', at: '2026-04-11T02:00:00.000Z',
    status: 'success', durationMs: 100, mode: 'scheduled',
  });
  p.writeRun({
    jobId: 'a', at: '2026-04-12T02:00:00.000Z',
    status: 'success', durationMs: 150, mode: 'scheduled',
  });
  p.writeRun({
    jobId: 'b', at: '2026-04-12T08:00:00.000Z',
    status: 'failure', durationMs: 50, error: 'boom', mode: 'scheduled',
  });
  const latest = await p.readLastRuns();
  assert.equal(latest.a.at, '2026-04-12T02:00:00.000Z');
  // "b" only has a failure on record → NOT returned (catch-up fires)
  assert.equal(latest.b, undefined);

  const hist = await p.readHistory('a', 10);
  assert.equal(hist.length, 2);
  assert.equal(hist[0].at, '2026-04-11T02:00:00.000Z');
});

test('persistence: readLastRuns on missing file returns empty object', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-jobs-'));
  const file = path.join(tmp, 'nonexistent.jsonl');
  const p = createJsonlPersistence({ file });
  const latest = await p.readLastRuns();
  assert.deepEqual(latest, {});
});

// ─────────────────────────────────────────────────────────────────
// CATCH-UP (missed runs on restart)
// ─────────────────────────────────────────────────────────────────

test('scheduler: catch-up fires once for a missed job on start()', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-jobs-'));
  const file = path.join(tmp, 'job-runs.jsonl');
  const persistence = createJsonlPersistence({ file });

  // Seed a stale run: last success was yesterday.
  persistence.writeRun({
    jobId: 'catchy',
    at: new Date(Date.now() - 24 * 60 * 60 * 1000 - 60 * 1000).toISOString(),
    status: 'success',
    durationMs: 10,
    mode: 'scheduled',
  });

  const sched = createScheduler({ persistence });
  let called = 0;
  sched.register({
    id: 'catchy',
    cron: '0 2 * * *', // once a day at 02:00 — definitely missed
    handler: async () => { called += 1; },
  });
  sched.start();
  // Allow catchUp (a microtask-chained async) to fire.
  await new Promise(r => setTimeout(r, 50));
  sched.stop();
  assert.equal(called, 1, 'catch-up should fire exactly once');
});

test('scheduler: runMissedOnStartup=false suppresses catch-up', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-jobs-'));
  const file = path.join(tmp, 'job-runs.jsonl');
  const persistence = createJsonlPersistence({ file });

  persistence.writeRun({
    jobId: 'quiet',
    at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: 'success',
    durationMs: 1,
    mode: 'scheduled',
  });

  const sched = createScheduler({ persistence });
  let called = 0;
  sched.register({
    id: 'quiet',
    cron: '0 2 * * *',
    runMissedOnStartup: false,
    handler: async () => { called += 1; },
  });
  sched.start();
  await new Promise(r => setTimeout(r, 50));
  sched.stop();
  assert.equal(called, 0);
});

// ─────────────────────────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────────────────────────

test('registerAdminRoutes: mounts all 5 endpoints on a fake app', async () => {
  const { registerAdminRoutes, bootstrap } = require('./jobs-runner');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-jobs-'));
  const runner = bootstrap({
    persistenceFile: path.join(tmp, 'runs.jsonl'),
    registerDefaults: false,
    logger: {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    },
  });
  runner.scheduler.register({
    id: 'x',
    cron: '*/5 * * * *',
    handler: async () => {},
  });

  const routes = [];
  const fakeApp = {
    get: (p, h) => routes.push({ method: 'GET', path: p, handler: h }),
    post: (p, h) => routes.push({ method: 'POST', path: p, handler: h }),
  };
  registerAdminRoutes(fakeApp, runner);

  const paths = routes.map(r => `${r.method} ${r.path}`);
  assert.ok(paths.includes('GET /api/admin/jobs'));
  assert.ok(paths.includes('GET /api/admin/jobs/:id'));
  assert.ok(paths.includes('POST /api/admin/jobs/:id/run-now'));
  assert.ok(paths.includes('POST /api/admin/jobs/:id/pause'));
  assert.ok(paths.includes('POST /api/admin/jobs/:id/resume'));

  // Exercise the list handler end-to-end
  const listHandler = routes.find(r => r.method === 'GET' && r.path === '/api/admin/jobs').handler;
  const resp = await runExpressHandler(listHandler, {});
  assert.equal(resp.body.ok, true);
  assert.equal(resp.body.count, 1);
  assert.equal(resp.body.jobs[0].id, 'x');

  // GET /:id
  const detailHandler = routes.find(r => r.method === 'GET' && r.path === '/api/admin/jobs/:id').handler;
  const detailResp = await runExpressHandler(detailHandler, { params: { id: 'x' } });
  assert.equal(detailResp.body.ok, true);
  assert.equal(detailResp.body.job.id, 'x');

  const missingResp = await runExpressHandler(detailHandler, { params: { id: 'ghost' } });
  assert.equal(missingResp.status, 404);

  // POST /:id/pause
  const pauseHandler = routes.find(r => r.method === 'POST' && r.path === '/api/admin/jobs/:id/pause').handler;
  const pauseResp = await runExpressHandler(pauseHandler, { params: { id: 'x' } });
  assert.equal(pauseResp.body.ok, true);
  assert.equal(runner.scheduler.get('x').paused, true);

  // POST /:id/run-now
  const runNowHandler = routes.find(r => r.method === 'POST' && r.path === '/api/admin/jobs/:id/run-now').handler;
  const runResp = await runExpressHandler(runNowHandler, { params: { id: 'x' } });
  assert.equal(runResp.body.ok, true);
});

// Tiny Express-stub runner for tests
function runExpressHandler(handler, req) {
  return new Promise((resolve, reject) => {
    let statusCode = 200;
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { resolve({ status: statusCode, body }); return this; },
    };
    try {
      const maybe = handler(req || {}, res);
      if (maybe && typeof maybe.catch === 'function') maybe.catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────

test('jobs-registry: DEFAULT_JOBS covers the 12 required ids', () => {
  const { DEFAULT_JOBS } = require('./jobs-registry');
  const ids = DEFAULT_JOBS.map(j => j.id);
  const expected = [
    'daily-backup',
    'monthly-vat-reminder',
    'monthly-wage-slip',
    'quarterly-tax-report',
    'annual-tax-reminder',
    'overdue-invoices-alert',
    'low-cash-alert',
    'health-check',
    'metrics-aggregation',
    'clean-old-logs',
    'token-refresh',
    'cache-warm',
  ];
  for (const id of expected) {
    assert.ok(ids.includes(id), `missing default job: ${id}`);
  }
});

test('jobs-registry: every DEFAULT_JOBS cron parses cleanly', () => {
  const { DEFAULT_JOBS } = require('./jobs-registry');
  for (const j of DEFAULT_JOBS) {
    const p = parseCronExpression(j.cron);
    assert.equal(p.fields.length, 5, `cron failed for ${j.id}: ${j.cron}`);
  }
});

test('jobs-registry: registerJob + registerDefaults + listJobs', () => {
  const reg = require('./jobs-registry');
  reg.clearRegistry();
  reg.registerJob({ id: 'custom-1', cron: '* * * * *', handler: async () => {} });
  assert.equal(reg.listJobs().length, 1);
  assert.throws(
    () => reg.registerJob({ id: 'custom-1', cron: '* * * * *', handler: async () => {} }),
    /duplicate/
  );
  reg.registerDefaults();
  assert.ok(reg.listJobs().length >= 13);
  assert.ok(reg.getJob('daily-backup'));
});
