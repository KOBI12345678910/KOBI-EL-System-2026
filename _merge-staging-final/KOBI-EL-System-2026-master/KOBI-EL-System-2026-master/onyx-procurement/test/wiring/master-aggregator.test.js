'use strict';

/**
 * master-aggregator.test.js  —  Agent Y-196
 * --------------------------------------------------------------
 * Unit + integration tests for MasterAggregator.
 *
 * Run:
 *   cd onyx-procurement
 *   node --test test/wiring/master-aggregator.test.js
 *
 * Coverage:
 *   - registration validation (id, factory, dependencies, scope, bilingual)
 *   - graph resolve: ordering, missing deps, cycle detection (simple + SCC)
 *   - buildAll lifecycle with async factories and dep injection
 *   - healthCheckAll aggregation (ok / unhealthy / throwing)
 *   - shutdown in reverse order with failure tolerance
 *   - bilingualRegistry structure
 *   - renderBilingualReport smoke
 *   - event emissions
 *   - SCOPES enum
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MasterAggregator,
  createAggregator,
  SCOPES,
  KNOWN_SCOPES,
  STATE,
} = require('../../src/wiring/master-aggregator.js');

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function mkFactory(tag) {
  return async (ctx, deps) => ({
    tag,
    ctx,
    deps,
    calls: 0,
    stopped: false,
  });
}

// ──────────────────────────────────────────────────────────────
// 01 · SCOPES enum is complete
// ──────────────────────────────────────────────────────────────

test('01. SCOPES enum exposes the four sub-systems', () => {
  assert.equal(SCOPES.ONYX_AI, 'onyx-ai');
  assert.equal(SCOPES.ONYX_PROCUREMENT, 'onyx-procurement');
  assert.equal(SCOPES.PAYROLL_AUTONOMOUS, 'payroll-autonomous');
  assert.equal(SCOPES.TECHNO_KOL_OPS, 'techno-kol-ops');
  assert.equal(KNOWN_SCOPES.length, 4);
  assert.ok(Object.isFrozen(SCOPES));
});

// ──────────────────────────────────────────────────────────────
// 02 · registerModule — happy path
// ──────────────────────────────────────────────────────────────

test('02. registerModule accepts minimal valid spec', () => {
  const a = new MasterAggregator();
  a.registerModule({
    id: 'db',
    factory: mkFactory('db'),
    dependencies: [],
    scope: SCOPES.ONYX_PROCUREMENT,
    name: { he: 'בסיס נתונים', en: 'Database' },
  });
  assert.equal(a.moduleCount(), 1);
  assert.ok(a.hasModule('db'));
  assert.deepEqual(a.listIds(), ['db']);
});

// ──────────────────────────────────────────────────────────────
// 03 · registerModule — rejects bad ids
// ──────────────────────────────────────────────────────────────

test('03. registerModule rejects missing or duplicate id', () => {
  const a = new MasterAggregator();
  assert.throws(() => a.registerModule({}), /id must be a non-empty string/);
  assert.throws(
    () => a.registerModule({ id: '', factory: () => ({}) }),
    /id must be a non-empty string/,
  );
  a.registerModule({ id: 'dup', factory: () => ({}) });
  assert.throws(
    () => a.registerModule({ id: 'dup', factory: () => ({}) }),
    /duplicate id/,
  );
});

// ──────────────────────────────────────────────────────────────
// 04 · registerModule — factory must be a function
// ──────────────────────────────────────────────────────────────

test('04. registerModule requires a factory function', () => {
  const a = new MasterAggregator();
  assert.throws(
    () => a.registerModule({ id: 'x', factory: 123 }),
    /factory must be a function/,
  );
});

// ──────────────────────────────────────────────────────────────
// 05 · registerModule — refuses self-dep and bad deps array
// ──────────────────────────────────────────────────────────────

test('05. registerModule refuses self-dependency and non-array deps', () => {
  const a = new MasterAggregator();
  assert.throws(
    () => a.registerModule({ id: 'a', factory: () => ({}), dependencies: 'b' }),
    /dependencies must be an array/,
  );
  assert.throws(
    () => a.registerModule({ id: 'a', factory: () => ({}), dependencies: ['a'] }),
    /may not depend on itself/,
  );
});

// ──────────────────────────────────────────────────────────────
// 06 · Strict scope check
// ──────────────────────────────────────────────────────────────

test('06. strict scope check rejects unknown sub-systems', () => {
  const a = new MasterAggregator(); // strict by default
  assert.throws(
    () => a.registerModule({ id: 'y', factory: () => ({}), scope: 'martian-erp' }),
    /unknown scope/,
  );
  const loose = new MasterAggregator({ strictScopes: false });
  loose.registerModule({ id: 'y', factory: () => ({}), scope: 'custom' });
  assert.ok(loose.hasModule('y'));
});

// ──────────────────────────────────────────────────────────────
// 07 · Bilingual name enforcement
// ──────────────────────────────────────────────────────────────

test('07. registerModule rejects broken bilingual name', () => {
  const a = new MasterAggregator();
  assert.throws(
    () => a.registerModule({
      id: 'n',
      factory: () => ({}),
      name: { he: '', en: 'only english' },
    }),
    /expected non-empty Hebrew string/,
  );
  assert.throws(
    () => a.registerModule({
      id: 'n',
      factory: () => ({}),
      name: { he: 'רק עברית' },
    }),
    /expected non-empty English string/,
  );
});

// ──────────────────────────────────────────────────────────────
// 08 · resolveGraph — linear topo order
// ──────────────────────────────────────────────────────────────

test('08. resolveGraph produces linear topological order', () => {
  const a = new MasterAggregator();
  a.registerAll([
    { id: 'api',     factory: mkFactory('api'),     dependencies: ['auth'] },
    { id: 'auth',    factory: mkFactory('auth'),    dependencies: ['db'] },
    { id: 'db',      factory: mkFactory('db'),      dependencies: [] },
    { id: 'billing', factory: mkFactory('billing'), dependencies: ['auth'] },
  ]);
  const { order, cycles, missing } = a.resolveGraph();
  assert.equal(cycles.length, 0);
  assert.equal(missing.length, 0);
  // db before auth, auth before billing & api
  const idxDb = order.indexOf('db');
  const idxAuth = order.indexOf('auth');
  const idxBill = order.indexOf('billing');
  const idxApi = order.indexOf('api');
  assert.ok(idxDb < idxAuth);
  assert.ok(idxAuth < idxBill);
  assert.ok(idxAuth < idxApi);
});

// ──────────────────────────────────────────────────────────────
// 09 · resolveGraph — reports missing deps
// ──────────────────────────────────────────────────────────────

test('09. resolveGraph reports missing dependencies', () => {
  const a = new MasterAggregator();
  a.registerModule({ id: 'api', factory: mkFactory('api'), dependencies: ['ghost'] });
  const { missing, order } = a.resolveGraph();
  assert.equal(missing.length, 1);
  assert.deepEqual(missing[0], { from: 'api', to: 'ghost' });
  // api still appears in order — missing is a reporting-only concern
  assert.ok(order.includes('api'));
});

// ──────────────────────────────────────────────────────────────
// 10 · Cycle detection — simple 2-node cycle
// ──────────────────────────────────────────────────────────────

test('10. resolveGraph detects a direct 2-node cycle', () => {
  const a = new MasterAggregator();
  a.registerAll([
    { id: 'a', factory: mkFactory('a'), dependencies: ['b'] },
    { id: 'b', factory: mkFactory('b'), dependencies: ['a'] },
  ]);
  const { order, cycles } = a.resolveGraph();
  assert.equal(order.length, 0);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0].sort(), ['a', 'b']);
});

// ──────────────────────────────────────────────────────────────
// 11 · Cycle detection — 3-node indirect cycle
// ──────────────────────────────────────────────────────────────

test('11. resolveGraph detects a 3-node indirect cycle (SCC)', () => {
  const a = new MasterAggregator();
  a.registerAll([
    { id: 'x', factory: mkFactory('x'), dependencies: ['y'] },
    { id: 'y', factory: mkFactory('y'), dependencies: ['z'] },
    { id: 'z', factory: mkFactory('z'), dependencies: ['x'] },
    { id: 'leaf', factory: mkFactory('leaf'), dependencies: [] }, // healthy node
  ]);
  const { order, cycles } = a.resolveGraph();
  // leaf is outside the cycle and should appear in order
  assert.ok(order.includes('leaf'));
  assert.equal(order.length, 1);
  assert.equal(cycles.length, 1);
  assert.deepEqual(cycles[0].sort(), ['x', 'y', 'z']);
});

// ──────────────────────────────────────────────────────────────
// 12 · buildAll — instantiates in dep order & injects deps
// ──────────────────────────────────────────────────────────────

test('12. buildAll instantiates in topo order and injects deps', async () => {
  const a = new MasterAggregator();
  const builtSequence = [];
  a.registerAll([
    {
      id: 'db',
      factory: async () => {
        builtSequence.push('db');
        return { kind: 'db' };
      },
      dependencies: [],
      scope: SCOPES.ONYX_PROCUREMENT,
    },
    {
      id: 'auth',
      factory: async (_ctx, deps) => {
        builtSequence.push('auth');
        assert.deepEqual(deps, { db: { kind: 'db' } });
        return { kind: 'auth', db: deps.db };
      },
      dependencies: ['db'],
      scope: SCOPES.ONYX_PROCUREMENT,
    },
    {
      id: 'api',
      factory: (_ctx, deps) => {
        builtSequence.push('api');
        assert.ok(deps.auth.db);
        return { kind: 'api', auth: deps.auth };
      },
      dependencies: ['auth'],
      scope: SCOPES.ONYX_PROCUREMENT,
    },
  ]);
  const instances = await a.buildAll({ tenant: 'uzi' });
  assert.deepEqual(builtSequence, ['db', 'auth', 'api']);
  assert.equal(instances.size, 3);
  assert.equal(a.getInstance('api').kind, 'api');
  assert.deepEqual(a.getBuildOrder(), ['db', 'auth', 'api']);
});

// ──────────────────────────────────────────────────────────────
// 13 · buildAll — throws on cycles (with cycles attached)
// ──────────────────────────────────────────────────────────────

test('13. buildAll throws on cycle and attaches details', async () => {
  const a = new MasterAggregator();
  a.registerAll([
    { id: 'a', factory: mkFactory('a'), dependencies: ['b'] },
    { id: 'b', factory: mkFactory('b'), dependencies: ['a'] },
  ]);
  await assert.rejects(() => a.buildAll(), /cycle detected/);
});

// ──────────────────────────────────────────────────────────────
// 14 · buildAll — surfaces factory errors with wrapping
// ──────────────────────────────────────────────────────────────

test('14. buildAll surfaces factory failures with cause', async () => {
  const a = new MasterAggregator();
  a.registerModule({
    id: 'boom',
    factory: () => { throw new Error('init failed'); },
    dependencies: [],
  });
  await assert.rejects(
    () => a.buildAll(),
    (err) => err.message.includes('boom') && err.cause && err.cause.message === 'init failed',
  );
});

// ──────────────────────────────────────────────────────────────
// 15 · healthCheckAll — mixed results
// ──────────────────────────────────────────────────────────────

test('15. healthCheckAll aggregates healthy, unhealthy, thrown, skipped', async () => {
  const a = new MasterAggregator();
  a.registerAll([
    {
      id: 'good',
      factory: () => ({}),
      dependencies: [],
      healthCheck: () => ({ ok: true, details: { uptime: 42 } }),
    },
    {
      id: 'bad',
      factory: () => ({}),
      dependencies: ['good'],
      healthCheck: () => ({ ok: false, details: { reason: 'disk full' } }),
    },
    {
      id: 'throws',
      factory: () => ({}),
      dependencies: ['good'],
      healthCheck: () => { throw new Error('probe crashed'); },
    },
    {
      id: 'skipped',
      factory: () => ({}),
      dependencies: ['good'],
      // no healthCheck
    },
  ]);
  await a.buildAll();
  const { ok, results } = await a.healthCheckAll();
  assert.equal(ok, false);
  const by = Object.fromEntries(results.map((r) => [r.id, r]));
  assert.equal(by.good.ok, true);
  assert.equal(by.bad.ok, false);
  assert.equal(by.throws.ok, false);
  assert.match(by.throws.error, /probe crashed/);
  assert.equal(by.skipped.ok, true);
  assert.equal(by.skipped.skipped, true);
});

// ──────────────────────────────────────────────────────────────
// 16 · shutdown — reverse order, tolerates errors
// ──────────────────────────────────────────────────────────────

test('16. shutdown runs in reverse build order and tolerates errors', async () => {
  const a = new MasterAggregator();
  const stopped = [];
  a.registerAll([
    {
      id: 'db',
      factory: () => ({}),
      dependencies: [],
      shutdown: () => { stopped.push('db'); },
    },
    {
      id: 'cache',
      factory: () => ({}),
      dependencies: ['db'],
      shutdown: () => { stopped.push('cache'); },
    },
    {
      id: 'api',
      factory: () => ({}),
      dependencies: ['cache'],
      shutdown: () => {
        stopped.push('api');
        throw new Error('api-stop-flapped');
      },
    },
  ]);
  await a.buildAll();
  const { ok, errors, order } = await a.shutdown();
  assert.deepEqual(stopped, ['api', 'cache', 'db']);
  assert.deepEqual(order, ['api', 'cache', 'db']);
  assert.equal(ok, false);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].id, 'api');
});

// ──────────────────────────────────────────────────────────────
// 17 · bilingualRegistry — both languages + scope grouping
// ──────────────────────────────────────────────────────────────

test('17. bilingualRegistry returns HE and EN plus scope grouping', () => {
  const a = new MasterAggregator();
  a.registerAll([
    {
      id: 'tax',
      factory: () => ({}),
      scope: SCOPES.ONYX_PROCUREMENT,
      name: { he: 'מיסים', en: 'Tax' },
      description: { he: 'מודול מיסים ומע״מ', en: 'Tax and VAT module' },
    },
    {
      id: 'salary',
      factory: () => ({}),
      scope: SCOPES.PAYROLL_AUTONOMOUS,
      name: { he: 'שכר', en: 'Payroll' },
    },
  ]);
  const reg = a.bilingualRegistry();
  assert.equal(reg.he.length, 2);
  assert.equal(reg.en.length, 2);
  const heIds = reg.he.map((r) => r.id).sort();
  assert.deepEqual(heIds, ['salary', 'tax']);
  const taxHe = reg.he.find((r) => r.id === 'tax');
  assert.equal(taxHe.שם, 'מיסים');
  assert.equal(taxHe.תחום, 'onyx-procurement');
  assert.deepEqual(Object.keys(reg.byScope).sort(), [
    'onyx-procurement',
    'payroll-autonomous',
  ]);
  assert.deepEqual(reg.byScope['onyx-procurement'], ['tax']);
});

// ──────────────────────────────────────────────────────────────
// 18 · Events — build, healthy, stopped
// ──────────────────────────────────────────────────────────────

test('18. aggregator emits lifecycle events', async () => {
  const a = new MasterAggregator();
  const seen = [];
  a.on('module:built',   (p) => seen.push(`built:${p.id}`));
  a.on('module:healthy', (p) => seen.push(`healthy:${p.id}`));
  a.on('module:stopped', (p) => seen.push(`stopped:${p.id}`));
  a.on('build:complete', (p) => seen.push(`build:complete:${p.order.join(',')}`));
  a.on('shutdown:complete', (p) => seen.push(`shutdown:complete:${p.order.join(',')}`));

  a.registerAll([
    { id: 'alpha', factory: () => ({}), dependencies: [], healthCheck: () => ({ ok: true }) },
    { id: 'beta',  factory: () => ({}), dependencies: ['alpha'], healthCheck: () => ({ ok: true }) },
  ]);
  await a.buildAll();
  await a.healthCheckAll();
  await a.shutdown();

  assert.ok(seen.includes('built:alpha'));
  assert.ok(seen.includes('built:beta'));
  assert.ok(seen.includes('healthy:alpha'));
  assert.ok(seen.includes('healthy:beta'));
  assert.ok(seen.includes('build:complete:alpha,beta'));
  assert.ok(seen.includes('shutdown:complete:beta,alpha'));
});

// ──────────────────────────────────────────────────────────────
// 19 · healthCheckAll before buildAll throws
// ──────────────────────────────────────────────────────────────

test('19. healthCheckAll requires a prior buildAll', async () => {
  const a = new MasterAggregator();
  a.registerModule({ id: 'z', factory: () => ({}) });
  await assert.rejects(() => a.healthCheckAll(), /call buildAll\(\) first/);
});

// ──────────────────────────────────────────────────────────────
// 20 · renderBilingualReport smoke
// ──────────────────────────────────────────────────────────────

test('20. renderBilingualReport contains HE and EN lines', () => {
  const a = new MasterAggregator();
  a.registerAll([
    { id: 'one', factory: () => ({}), scope: SCOPES.ONYX_AI },
    { id: 'two', factory: () => ({}), dependencies: ['one'], scope: SCOPES.ONYX_AI },
  ]);
  const txt = a.renderBilingualReport();
  assert.match(txt, /HE:/);
  assert.match(txt, /EN:/);
  assert.match(txt, /onyx-ai/);
  assert.match(txt, /one/);
  assert.match(txt, /two/);
});

// ──────────────────────────────────────────────────────────────
// 21 · createAggregator factory helper
// ──────────────────────────────────────────────────────────────

test('21. createAggregator returns a MasterAggregator instance', () => {
  const a = createAggregator();
  assert.ok(a instanceof MasterAggregator);
  assert.equal(a.moduleCount(), 0);
});

// ──────────────────────────────────────────────────────────────
// 22 · STATE enum is frozen
// ──────────────────────────────────────────────────────────────

test('22. STATE enum is frozen and has expected members', () => {
  assert.ok(Object.isFrozen(STATE));
  assert.equal(STATE.REGISTERED, 'registered');
  assert.equal(STATE.BUILT, 'built');
  assert.equal(STATE.HEALTHY, 'healthy');
  assert.equal(STATE.STOPPED, 'stopped');
});

// ──────────────────────────────────────────────────────────────
// 23 · Integration — four sub-systems wired together
// ──────────────────────────────────────────────────────────────

test('23. integration: four sub-systems wired in dep order', async () => {
  const a = new MasterAggregator();
  a.registerAll([
    // onyx-ai
    {
      id: 'ai-core',
      factory: () => ({ name: 'ai-core' }),
      scope: SCOPES.ONYX_AI,
      name: { he: 'ליבת בינה', en: 'AI Core' },
    },
    // onyx-procurement depends on ai-core
    {
      id: 'proc-core',
      factory: (_c, d) => ({ name: 'proc-core', ai: d['ai-core'] }),
      dependencies: ['ai-core'],
      scope: SCOPES.ONYX_PROCUREMENT,
      name: { he: 'רכש', en: 'Procurement' },
    },
    // payroll depends on procurement (expenses feed salaries)
    {
      id: 'payroll',
      factory: (_c, d) => ({ name: 'payroll', proc: d['proc-core'] }),
      dependencies: ['proc-core'],
      scope: SCOPES.PAYROLL_AUTONOMOUS,
      name: { he: 'שכר אוטונומי', en: 'Autonomous Payroll' },
    },
    // ops depends on everything upstream
    {
      id: 'ops',
      factory: (_c, d) => ({
        name: 'ops',
        links: [d['ai-core'].name, d['proc-core'].name, d.payroll.name],
      }),
      dependencies: ['ai-core', 'proc-core', 'payroll'],
      scope: SCOPES.TECHNO_KOL_OPS,
      name: { he: 'תפעול טכנו-קול', en: 'Techno-Kol Ops' },
    },
  ]);
  const instances = await a.buildAll({ tenant: 'techno-kol' });
  assert.deepEqual(a.getBuildOrder(), ['ai-core', 'proc-core', 'payroll', 'ops']);
  assert.equal(instances.size, 4);
  assert.deepEqual(a.getInstance('ops').links, ['ai-core', 'proc-core', 'payroll']);

  const health = await a.healthCheckAll();
  assert.equal(health.ok, true);
  assert.equal(health.results.length, 4);

  const { ok, order } = await a.shutdown();
  assert.equal(ok, true);
  assert.deepEqual(order, ['ops', 'payroll', 'proc-core', 'ai-core']);
});

// ──────────────────────────────────────────────────────────────
// 24 · getInstance before build throws
// ──────────────────────────────────────────────────────────────

test('24. getInstance before buildAll throws RangeError', () => {
  const a = new MasterAggregator();
  a.registerModule({ id: 'x', factory: () => ({}) });
  assert.throws(() => a.getInstance('x'), /has not been built/);
});

// ──────────────────────────────────────────────────────────────
// 25 · buildAll on missing dep throws before invoking factories
// ──────────────────────────────────────────────────────────────

test('25. buildAll throws on missing dependency', async () => {
  const a = new MasterAggregator();
  let factoryCalled = false;
  a.registerModule({
    id: 'only',
    factory: () => { factoryCalled = true; return {}; },
    dependencies: ['phantom'],
  });
  await assert.rejects(() => a.buildAll(), /missing dependencies/);
  assert.equal(factoryCalled, false);
});
