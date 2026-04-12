/**
 * Tests for Y-178 — Blue/Green Deployment Orchestrator
 * Test runner: node:test (built-in). No external deps.
 *
 * Covers:
 *   • activeSlot/standbySlot initial + after switch
 *   • deployToStandby happy path + error path
 *   • smoke tests pass + fail
 *   • DB migration guard — expand-only pass, contract blocks,
 *     mixed bundle, caller-labelled phase respected, destructive
 *     always blocks
 *   • warmup uses injectable sleep (deterministic)
 *   • cache preheat
 *   • switchTraffic happy path (atomic) + required preconditions
 *   • rollback round-trip
 *   • audit trail is bilingual + append-only
 *   • full cycle helper
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BlueGreenDeployer,
  SLOTS,
  STATE,
  PHASES,
  scanStatement,
  oppositeSlot,
  validateSlot,
} = require('../../src/devops/blue-green');

/* ---------- helpers ---------- */

function makeAdapter(overrides = {}) {
  const base = {
    deployed: { blue: null, green: null },
    health:   { blue: true, green: true },
    cache:    { blue: new Set(), green: new Set() },
    trafficLog: [],
    async deploy(slot, version) {
      if (overrides.deploy) return overrides.deploy(slot, version);
      this.deployed[slot] = version;
      return { slot, version, ok: true };
    },
    async healthProbe(slot, path) {
      if (overrides.healthProbe) return overrides.healthProbe(slot, path);
      return this.health[slot] === true;
    },
    async shiftTraffic(slot) {
      if (overrides.shiftTraffic) return overrides.shiftTraffic(slot);
      this.trafficLog.push(slot);
      return { active: slot, ok: true };
    },
    async preheatKey(slot, key) {
      if (overrides.preheatKey) return overrides.preheatKey(slot, key);
      this.cache[slot].add(key);
      return true;
    },
  };
  return base;
}

function makeDeployer(opts = {}) {
  const adapter = opts.adapter || makeAdapter();
  const sleep   = opts.sleep   || (() => Promise.resolve());
  const clock   = opts.clock   || (() => 1712827200000); // 2024-04-11
  return new BlueGreenDeployer({
    warmupMs: 10,
    smokeTimeoutMs: 1000,
    requiredSmokeTests: ['/health', '/ready'],
    adapter,
    sleep,
    clock,
    ...opts,
  });
}

/* ---------- 1. initial state ---------- */

test('1. activeSlot/standbySlot — default initial is blue/green', () => {
  const d = makeDeployer();
  assert.equal(d.activeSlot(), SLOTS.BLUE);
  assert.equal(d.standbySlot(), SLOTS.GREEN);
  assert.equal(d.state(), STATE.IDLE);
});

test('2. initialSlot=green flips the defaults', () => {
  const d = makeDeployer({ initialSlot: 'green' });
  assert.equal(d.activeSlot(), SLOTS.GREEN);
  assert.equal(d.standbySlot(), SLOTS.BLUE);
});

test('3. oppositeSlot / validateSlot helpers', () => {
  assert.equal(oppositeSlot('blue'), 'green');
  assert.equal(oppositeSlot('green'), 'blue');
  assert.throws(() => oppositeSlot('red'), /unknown slot/);
  assert.equal(validateSlot('blue'), 'blue');
  assert.throws(() => validateSlot('red'), /must be 'blue' or 'green'/);
});

/* ---------- 2. deploy ---------- */

test('4. deployToStandby writes to standby, not active', async () => {
  const adapter = makeAdapter();
  const d = makeDeployer({ adapter });
  const r = await d.deployToStandby('v2.4.1');
  assert.equal(r.slot, 'green');
  assert.equal(r.version, 'v2.4.1');
  assert.equal(adapter.deployed.green, 'v2.4.1');
  assert.equal(adapter.deployed.blue, null); // active untouched
  assert.equal(d.standbyVersion(), 'v2.4.1');
});

test('5. deployToStandby rejects empty version + surfaces adapter errors', async () => {
  const d = makeDeployer();
  await assert.rejects(() => d.deployToStandby(''), /non-empty string/);

  const boom = makeDeployer({
    adapter: makeAdapter({
      deploy: async () => { throw new Error('adapter-down'); },
    }),
  });
  await assert.rejects(() => boom.deployToStandby('v1.0.0'), /adapter-down/);
  assert.equal(boom.state(), STATE.FAILED);
});

/* ---------- 3. smoke tests ---------- */

test('6. smokeTests pass when adapter.healthProbe returns true', async () => {
  const d = makeDeployer();
  await d.deployToStandby('v2');
  const r = await d.smokeTests('green');
  assert.equal(r.pass, true);
  assert.equal(r.results.length, 2); // /health + /ready
  assert.equal(r.slot, 'green');
});

test('7. smokeTests fail when healthProbe returns false for any path', async () => {
  const adapter = makeAdapter({
    healthProbe: async (_slot, path) => path !== '/ready',
  });
  const d = makeDeployer({ adapter });
  await d.deployToStandby('v2');
  const r = await d.smokeTests('green');
  assert.equal(r.pass, false);
  assert.equal(d.state(), STATE.FAILED);
  const failed = r.results.filter((x) => !x.ok);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].path, '/ready');
});

/* ---------- 4. DB migration guard ---------- */

test('8. dbMigrationGuard — EXPAND-only bundle passes (compat=true)', async () => {
  const d = makeDeployer();
  const bundle = [
    'CREATE TABLE users_v2 (id BIGINT PRIMARY KEY, email TEXT)',
    'ALTER TABLE invoices ADD COLUMN vat_rate_v2 NUMERIC(5,2)',
    'CREATE INDEX CONCURRENTLY idx_users_v2_email ON users_v2(email)',
  ];
  const r = await d.dbMigrationGuard(bundle);
  assert.equal(r.compat, true);
  assert.equal(r.blockers.length, 0);
  assert.equal(r.summary.expand, 3);
  assert.notEqual(d.state(), STATE.BLOCKED);
});

test('9. dbMigrationGuard — CONTRACT (DROP COLUMN) blocks + state=BLOCKED', async () => {
  const d = makeDeployer();
  const bundle = [
    'ALTER TABLE invoices DROP COLUMN legacy_total',
    'CREATE TABLE audit_events (id BIGINT)',
  ];
  const r = await d.dbMigrationGuard(bundle);
  assert.equal(r.compat, false);
  assert.equal(r.blockers.length, 1);
  assert.equal(r.blockers[0].verb, 'DROP COLUMN');
  assert.equal(d.state(), STATE.BLOCKED);
});

test('10. dbMigrationGuard — rename/type-change/truncate are all contract', async () => {
  const d = makeDeployer();
  const bundle = [
    { sql: 'ALTER TABLE users RENAME COLUMN email TO email_old' },
    { sql: 'ALTER TABLE payments ALTER COLUMN amount TYPE BIGINT' },
    { sql: 'TRUNCATE TABLE stale_cache' },
  ];
  const r = await d.dbMigrationGuard(bundle);
  assert.equal(r.compat, false);
  assert.equal(r.blockers.length, 3);
});

test('11. dbMigrationGuard — caller may NOT whitelabel destructive as expand', async () => {
  const d = makeDeployer();
  const bundle = {
    phase: 'expand',
    statements: [
      { sql: 'DROP TABLE legacy_orders', phase: 'expand' }, // lie
    ],
  };
  const r = await d.dbMigrationGuard(bundle);
  assert.equal(r.compat, false);
  assert.equal(r.blockers.length, 1);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].note, /destructive verb/);
});

test('12. dbMigrationGuard — invalid bundle rejected', async () => {
  const d = makeDeployer();
  await assert.rejects(() => d.dbMigrationGuard(42), /array or \{statements/);
});

test('13. scanStatement — direct classifier sanity', () => {
  assert.equal(scanStatement('ADD COLUMN foo INT').phase, PHASES.EXPAND);
  assert.equal(scanStatement('CREATE INDEX idx ON t(c)').phase, PHASES.EXPAND);
  assert.equal(scanStatement('drop column foo').phase, PHASES.CONTRACT);
  assert.equal(scanStatement('UPDATE users SET x=1').phase, PHASES.MIGRATE);
});

/* ---------- 5. warmup ---------- */

test('14. warmup calls injected sleep with configured ms', async () => {
  let slept = null;
  const d = makeDeployer({
    warmupMs: 250,
    sleep: async (ms) => { slept = ms; },
  });
  const r = await d.warmup();
  assert.equal(slept, 250);
  assert.equal(r.durationMs, 250);
  assert.equal(d.state(), STATE.WARMING);
});

test('15. warmup accepts override argument', async () => {
  let slept = null;
  const d = makeDeployer({ sleep: async (ms) => { slept = ms; } });
  await d.warmup(42);
  assert.equal(slept, 42);
});

/* ---------- 6. cache preheat ---------- */

test('16. cachePreheat feeds keys to adapter.preheatKey on standby only', async () => {
  const adapter = makeAdapter();
  const d = makeDeployer({ adapter });
  const r = await d.cachePreheat(['suppliers', 'warehouses', 'users']);
  assert.equal(r.ok, 3);
  assert.equal(r.total, 3);
  assert.equal(adapter.cache.green.size, 3);
  assert.equal(adapter.cache.blue.size, 0);
});

test('17. cachePreheat counts partial failures without throwing', async () => {
  const d = makeDeployer({
    adapter: makeAdapter({
      preheatKey: async (_slot, key) => key !== 'bad',
    }),
  });
  const r = await d.cachePreheat(['ok1', 'bad', 'ok2']);
  assert.equal(r.ok, 2);
  assert.equal(r.total, 3);
  assert.equal(r.results.find((x) => x.key === 'bad').ok, false);
});

test('18. cachePreheat rejects non-array', async () => {
  const d = makeDeployer();
  await assert.rejects(() => d.cachePreheat('nope'), /must be an array/);
});

/* ---------- 7. switch traffic ---------- */

test('19. switchTraffic blocks when preconditions unmet', async () => {
  const d = makeDeployer();
  // no deploy, no smoke, no guard
  await assert.rejects(() => d.switchTraffic(), /no version deployed/);

  await d.deployToStandby('v2');
  await assert.rejects(() => d.switchTraffic(), /smoke test did not pass/);
});

test('20. switchTraffic atomically swaps slots on happy path', async () => {
  const adapter = makeAdapter();
  const d = makeDeployer({ adapter });
  await d.deployToStandby('v2.0');
  await d.smokeTests('green');
  await d.dbMigrationGuard(['ADD COLUMN foo INT']);
  await d.warmup();
  await d.cachePreheat(['k']);
  const r = await d.switchTraffic();
  assert.equal(r.active, 'green');
  assert.equal(r.standby, 'blue');
  assert.equal(r.activeVersion, 'v2.0');
  assert.equal(d.state(), STATE.SWITCHED);
  assert.deepEqual(adapter.trafficLog, ['green']);
});

test('21. switchTraffic BLOCKED state refuses to proceed', async () => {
  const d = makeDeployer();
  await d.deployToStandby('v2');
  await d.smokeTests('green');
  await d.dbMigrationGuard(['DROP TABLE x']); // → BLOCKED
  await assert.rejects(() => d.switchTraffic(), /BLOCKED/);
});

/* ---------- 8. rollback ---------- */

test('22. rollback restores previous slot + version', async () => {
  const adapter = makeAdapter();
  const d = makeDeployer({ adapter });
  await d.deployToStandby('v2.0');
  await d.smokeTests('green');
  await d.dbMigrationGuard(['ADD COLUMN x INT']);
  await d.switchTraffic();
  assert.equal(d.activeSlot(), 'green');
  const r = await d.rollback();
  assert.equal(r.active, 'blue');
  assert.equal(r.standby, 'green');
  assert.equal(d.state(), STATE.ROLLED_BACK);
  assert.deepEqual(adapter.trafficLog, ['green', 'blue']);
});

test('23. rollback with no prior switch is rejected', async () => {
  const d = makeDeployer();
  await assert.rejects(() => d.rollback(), /nothing to roll back/);
});

/* ---------- 9. audit trail is bilingual + append-only ---------- */

test('24. audit trail records bilingual entries for every phase', async () => {
  const d = makeDeployer();
  await d.deployToStandby('v2');
  await d.smokeTests('green');
  await d.dbMigrationGuard(['ADD COLUMN y INT']);
  await d.warmup();
  await d.cachePreheat(['a']);
  await d.switchTraffic();
  const trail = d.auditTrail();
  assert.ok(trail.length >= 8);
  for (const e of trail) {
    assert.equal(typeof e.en, 'string');
    assert.equal(typeof e.he, 'string');
    assert.ok(e.en.length > 0);
    assert.ok(e.he.length > 0);
    assert.ok(e.id);
    assert.ok(e.at);
  }
  // Must contain at least one Hebrew letter in the HE column
  assert.ok(trail.some((e) => /[\u0590-\u05FF]/.test(e.he)));
});

test('25. audit trail is append-only (returned copy cannot mutate state)', async () => {
  const d = makeDeployer();
  await d.deployToStandby('v2');
  const before = d.auditTrail().length;
  const copy = d.auditTrail();
  copy.push({ fake: 'entry' });
  assert.equal(d.auditTrail().length, before);
  // mutating an entry in the copy must not affect the source
  copy[0].en = 'TAMPERED';
  assert.notEqual(d.auditTrail()[0].en, 'TAMPERED');
});

/* ---------- 10. full cycle + never-delete guarantee ---------- */

test('26. runFullCycle happy path drives every phase', async () => {
  const d = makeDeployer();
  const out = await d.runFullCycle({
    version: 'v3.1.0',
    migrations: ['ADD COLUMN n INT', 'CREATE INDEX idx ON t(n)'],
    preheatKeys: ['suppliers', 'warehouses'],
  });
  assert.equal(out.active, 'green');
  assert.equal(out.activeVersion, 'v3.1.0');
  assert.equal(d.state(), STATE.SWITCHED);
});

test('27. never-delete — rollback restores previous-version metadata intact', async () => {
  const d = makeDeployer({ initialVersion: 'v1.0.0' });
  await d.runFullCycle({
    version: 'v2.0.0',
    migrations: [],
    preheatKeys: [],
  });
  assert.equal(d.activeVersion(), 'v2.0.0');
  assert.equal(d.standbyVersion(), 'v1.0.0'); // old version NOT deleted
  await d.rollback();
  assert.equal(d.activeVersion(), 'v1.0.0');
  assert.equal(d.standbyVersion(), 'v2.0.0'); // new version still present
});

test('28. emits state + audit events for observability', async () => {
  const d = makeDeployer();
  const states = [];
  const audits = [];
  d.on('state', (s) => states.push(s));
  d.on('audit', (a) => audits.push(a.kind));
  await d.deployToStandby('v2');
  await d.smokeTests('green');
  assert.ok(states.includes(STATE.DEPLOYING));
  assert.ok(states.includes(STATE.SMOKE_TESTING));
  assert.ok(audits.includes('deploy-begin'));
  assert.ok(audits.includes('smoke-ok'));
});
