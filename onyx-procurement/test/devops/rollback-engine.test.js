/**
 * Unit tests for RollbackEngine — automated rollback + safety guards
 * Agent Y-179 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Run:   node --test test/devops/rollback-engine.test.js
 *
 * 20 tests covering:
 *   - trigger registration & validation
 *   - watch() breach detection + duration gating
 *   - freeze windows (auto blocked / manual allowed)
 *   - loop-guard (pause after N in M)
 *   - loop-guard resume by operator
 *   - dependency rollback order (topological)
 *   - dependency cycle detection
 *   - destructive migration SQL scanner
 *   - custom migration check + fail-closed
 *   - autoRollback success / failure recording
 *   - manualRollback bypasses freeze
 *   - manualRollback still blocked by destructive migration unless forced
 *   - bilingual incident summary (English + Hebrew)
 *   - history retention (never-delete principle)
 *   - metric function errors are isolated
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RollbackEngine,
  ROLLBACK_OUTCOME,
  scanMigrationSql,
} = require('../../src/devops/rollback-engine.js');

/* ------------------------------------------------------------------ */
/*  Helper — controllable clock                                        */
/* ------------------------------------------------------------------ */
function makeClock(start) {
  let t = start;
  const fn = () => t;
  fn.advance = (ms) => {
    t += ms;
  };
  fn.set = (v) => {
    t = v;
  };
  return fn;
}

/* ------------------------------------------------------------------ */
/*  01 — registerTrigger validates inputs                              */
/* ------------------------------------------------------------------ */
test('01. registerTrigger validates arguments', () => {
  const engine = new RollbackEngine();
  assert.throws(() => engine.registerTrigger('', () => 0, 0.1, 1000), /cannot be empty/);
  assert.throws(() => engine.registerTrigger('x', 'nope', 0.1, 1000), /must be a function/);
  assert.throws(() => engine.registerTrigger('x', () => 0, -1, 1000), /positive finite/);
  assert.throws(() => engine.registerTrigger('x', () => 0, 0.1, -5), /positive finite/);
  // Valid registration returns engine (chainable)
  const ret = engine.registerTrigger('error-rate', () => 0, 0.05, 30_000);
  assert.equal(ret, engine);
});

/* ------------------------------------------------------------------ */
/*  02 — watch() reports no breach when metric below threshold         */
/* ------------------------------------------------------------------ */
test('02. watch reports no breach when metric below threshold', () => {
  const clock = makeClock(1_000_000);
  const engine = new RollbackEngine({ clock });
  engine.registerTrigger('error-rate', () => 0.01, 0.05, 10_000);
  const report = engine.watch('rel-1');
  assert.equal(report.ready, false);
  assert.equal(report.triggers.length, 1);
  assert.equal(report.triggers[0].inBreach, false);
  assert.equal(report.triggers[0].persistedMs, 0);
});

/* ------------------------------------------------------------------ */
/*  03 — watch() requires duration to elapse before firing             */
/* ------------------------------------------------------------------ */
test('03. watch requires persisted duration to be ready', () => {
  const clock = makeClock(1_000_000);
  let rate = 0.10; // always in breach
  const engine = new RollbackEngine({ clock });
  engine.registerTrigger('err', () => rate, 0.05, 30_000);

  // First evaluation — breach just started
  let report = engine.watch('rel-1');
  assert.equal(report.ready, false, 'should not fire immediately');
  assert.equal(report.triggers[0].inBreach, true);

  // Advance 29 seconds — still not ready
  clock.advance(29_000);
  report = engine.watch('rel-1');
  assert.equal(report.ready, false);

  // Advance 2 more seconds — now ready (31s > 30s)
  clock.advance(2_000);
  report = engine.watch('rel-1');
  assert.equal(report.ready, true);
  assert.equal(report.readyTrigger, 'err');
});

/* ------------------------------------------------------------------ */
/*  04 — breach start resets when metric recovers                      */
/* ------------------------------------------------------------------ */
test('04. breach counter resets when metric recovers', () => {
  const clock = makeClock(1_000_000);
  let rate = 0.10;
  const engine = new RollbackEngine({ clock });
  engine.registerTrigger('err', () => rate, 0.05, 30_000);

  engine.watch('rel-1'); // breach begins
  clock.advance(20_000);
  rate = 0.01; // recover
  const report = engine.watch('rel-1');
  assert.equal(report.triggers[0].inBreach, false);
  assert.equal(report.triggers[0].breachStart, null);
});

/* ------------------------------------------------------------------ */
/*  05 — freeze() blocks auto-rollback                                 */
/* ------------------------------------------------------------------ */
test('05. freeze window blocks auto-rollback', async () => {
  const clock = makeClock(1_000_000);
  const engine = new RollbackEngine({ clock });
  engine.freeze(1_000_000, 1_060_000, 'business hours');
  const incident = await engine.autoRollback('rel-1', 'slo-breach');
  assert.equal(incident.outcome, ROLLBACK_OUTCOME.BLOCKED_FREEZE);
  assert.match(incident.note, /freeze/);
});

/* ------------------------------------------------------------------ */
/*  06 — manualRollback bypasses freeze window                         */
/* ------------------------------------------------------------------ */
test('06. manualRollback bypasses freeze window', async () => {
  const clock = makeClock(1_000_000);
  const engine = new RollbackEngine({
    clock,
    executor: async () => ({ ok: true }),
  });
  engine.freeze(1_000_000, 1_060_000, 'business hours');
  const incident = await engine.manualRollback('rel-1', 'slo-breach', 'alice');
  assert.equal(incident.outcome, ROLLBACK_OUTCOME.SUCCESS);
  assert.equal(incident.operator, 'alice');
});

/* ------------------------------------------------------------------ */
/*  07 — loop-guard pauses engine after N rollbacks in window          */
/* ------------------------------------------------------------------ */
test('07. loop-guard pauses engine after N rollbacks in window', async () => {
  const clock = makeClock(1_000_000);
  const engine = new RollbackEngine({
    clock,
    executor: async () => ({ ok: true }),
    loopGuardCount: 3,
    loopGuardWindowMs: 10 * 60 * 1000,
  });

  // First three succeed
  await engine.autoRollback('rel-1', 'error-spike');
  await engine.autoRollback('rel-2', 'error-spike');
  await engine.autoRollback('rel-3', 'error-spike');

  // Fourth triggers the guard
  const blocked = await engine.autoRollback('rel-4', 'error-spike');
  assert.equal(blocked.outcome, ROLLBACK_OUTCOME.BLOCKED_LOOPGUARD);
  assert.equal(engine.pausedByLoopGuard(), true);

  const status = engine.loopGuardStatus();
  assert.equal(status.pausedByLoopGuard, true);
  assert.equal(status.recentRollbacks, 3);
});

/* ------------------------------------------------------------------ */
/*  08 — paused engine rejects further auto-rollbacks                  */
/* ------------------------------------------------------------------ */
test('08. paused engine blocks further auto-rollbacks until resume', async () => {
  const clock = makeClock(1_000_000);
  const engine = new RollbackEngine({
    clock,
    executor: async () => ({ ok: true }),
    loopGuardCount: 2,
  });
  await engine.autoRollback('rel-1', 'slo-breach');
  await engine.autoRollback('rel-2', 'slo-breach');
  const guard1 = await engine.autoRollback('rel-3', 'slo-breach');
  assert.equal(guard1.outcome, ROLLBACK_OUTCOME.BLOCKED_LOOPGUARD);

  // Still paused
  const guard2 = await engine.autoRollback('rel-4', 'slo-breach');
  assert.equal(guard2.outcome, ROLLBACK_OUTCOME.BLOCKED_LOOPGUARD);

  // Operator resumes
  const resumed = engine.resume('ops-alice');
  assert.equal(resumed, true);
  assert.equal(engine.pausedByLoopGuard(), false);
});

/* ------------------------------------------------------------------ */
/*  09 — loop-guard window slides (old rollbacks fall off)             */
/* ------------------------------------------------------------------ */
test('09. loop-guard window slides over time', async () => {
  const clock = makeClock(1_000_000);
  const engine = new RollbackEngine({
    clock,
    executor: async () => ({ ok: true }),
    loopGuardCount: 3,
    loopGuardWindowMs: 60_000,
  });
  await engine.autoRollback('rel-1', 'slo-breach');
  clock.advance(30_000);
  await engine.autoRollback('rel-2', 'slo-breach');
  // Advance far beyond window — old rollbacks slide out
  clock.advance(120_000);
  const fresh = await engine.autoRollback('rel-3', 'slo-breach');
  assert.equal(fresh.outcome, ROLLBACK_OUTCOME.SUCCESS);
  assert.equal(engine.pausedByLoopGuard(), false);
});

/* ------------------------------------------------------------------ */
/*  10 — dependency graph: topological rollback order                  */
/* ------------------------------------------------------------------ */
test('10. getDependencyOrder returns upstream-first topological order', () => {
  const engine = new RollbackEngine();
  engine.registerDependency('web', ['api']);
  engine.registerDependency('api', ['db']);
  const order = engine.getDependencyOrder('web');
  // Upstream first: db, api, web
  assert.deepEqual(order, ['db', 'api', 'web']);
});

/* ------------------------------------------------------------------ */
/*  11 — dependency cycle detection                                    */
/* ------------------------------------------------------------------ */
test('11. dependency cycle is detected and throws', () => {
  const engine = new RollbackEngine();
  engine.registerDependency('a', ['b']);
  engine.registerDependency('b', ['a']);
  assert.throws(() => engine.getDependencyOrder('a'), /cycle detected/);
});

/* ------------------------------------------------------------------ */
/*  12 — destructive migration scanner flags DROP TABLE                */
/* ------------------------------------------------------------------ */
test('12. scanMigrationSql flags destructive operations', () => {
  const dropTable = scanMigrationSql('DROP TABLE users;');
  assert.equal(dropTable.destructive, true);
  assert.ok(dropTable.reasons.includes('DROP TABLE'));

  const truncate = scanMigrationSql('TRUNCATE orders;');
  assert.equal(truncate.destructive, true);

  const deleteAll = scanMigrationSql('DELETE FROM logs;');
  assert.equal(deleteAll.destructive, true);
  assert.ok(deleteAll.reasons.some((r) => /DELETE/.test(r)));

  const safeDelete = scanMigrationSql('DELETE FROM logs WHERE id = 1;');
  assert.equal(safeDelete.destructive, false);

  const addCol = scanMigrationSql('ALTER TABLE users ADD COLUMN age INT;');
  assert.equal(addCol.destructive, false);
});

/* ------------------------------------------------------------------ */
/*  13 — autoRollback blocks destructive migration                     */
/* ------------------------------------------------------------------ */
test('13. autoRollback blocks destructive migration plan', async () => {
  const engine = new RollbackEngine({
    executor: async () => ({ ok: true }),
  });
  const incident = await engine.autoRollback('rel-1', 'slo-breach', {
    migrationPlan: { sql: 'DROP TABLE invoices;' },
  });
  assert.equal(incident.outcome, ROLLBACK_OUTCOME.BLOCKED_MIGRATION);
  assert.match(incident.note, /DROP TABLE/);
});

/* ------------------------------------------------------------------ */
/*  14 — manualRollback blocks destructive migration unless forced     */
/* ------------------------------------------------------------------ */
test('14. manualRollback respects destructive migration unless forced', async () => {
  const engine = new RollbackEngine({
    executor: async () => ({ ok: true }),
  });
  const blocked = await engine.manualRollback('rel-1', 'manual', 'alice', {
    migrationPlan: 'TRUNCATE audit_log;',
  });
  assert.equal(blocked.outcome, ROLLBACK_OUTCOME.BLOCKED_MIGRATION);

  const forced = await engine.manualRollback('rel-1', 'manual', 'alice', {
    migrationPlan: 'TRUNCATE audit_log;',
    forceDestructive: true,
  });
  assert.equal(forced.outcome, ROLLBACK_OUTCOME.SUCCESS);
});

/* ------------------------------------------------------------------ */
/*  15 — custom migration check can flag domain-specific risks         */
/* ------------------------------------------------------------------ */
test('15. custom migration check runs and flags plan', async () => {
  const engine = new RollbackEngine({
    executor: async () => ({ ok: true }),
  });
  engine.registerMigrationCheck('no-pii-drop', (plan) => {
    const text = typeof plan === 'string' ? plan : (plan && plan.description) || '';
    if (/pii/i.test(text)) {
      return { destructive: true, reasons: ['pii in description'] };
    }
    return { destructive: false, reasons: [] };
  });

  const result = engine.checkMigrationSafety({
    sql: 'ALTER TABLE users ADD c INT;',
    description: 'migrate pii data',
  });
  assert.equal(result.destructive, true);
  assert.ok(result.reasons.some((r) => /pii/.test(r)));
});

/* ------------------------------------------------------------------ */
/*  16 — custom migration check that throws fails closed              */
/* ------------------------------------------------------------------ */
test('16. custom migration check that throws is treated as unsafe', () => {
  const engine = new RollbackEngine();
  engine.registerMigrationCheck('broken', () => {
    throw new Error('check is buggy');
  });
  const result = engine.checkMigrationSafety({ sql: 'SELECT 1;' });
  assert.equal(result.destructive, true);
  assert.ok(result.reasons.some((r) => /check-threw/.test(r)));
});

/* ------------------------------------------------------------------ */
/*  17 — executor failure is recorded as FAILED outcome                */
/* ------------------------------------------------------------------ */
test('17. executor failure is recorded as FAILED outcome', async () => {
  const engine = new RollbackEngine({
    executor: async () => {
      throw new Error('kubectl apply failed');
    },
  });
  const incident = await engine.autoRollback('rel-1', 'slo-breach');
  assert.equal(incident.outcome, ROLLBACK_OUTCOME.FAILED);
  assert.match(incident.note, /kubectl/);
});

/* ------------------------------------------------------------------ */
/*  18 — bilingual incident summary contains English + Hebrew          */
/* ------------------------------------------------------------------ */
test('18. bilingual summary contains English and Hebrew labels', async () => {
  const engine = new RollbackEngine({
    executor: async () => ({ ok: true }),
  });
  await engine.autoRollback('rel-1', 'slo-breach');
  await engine.manualRollback('rel-2', 'manual', 'alice');

  const summary = engine.incidentSummary(10);
  // English section
  assert.match(summary, /Rollback Incident Summary/);
  assert.match(summary, /outcome \/ תוצאה/);
  assert.match(summary, /reason \/ סיבה/);
  // Hebrew
  assert.match(summary, /סיכום אירועי החזרה/);
  assert.match(summary, /הצלחה/);
  assert.match(summary, /הפרת יעד שירות/);
});

/* ------------------------------------------------------------------ */
/*  19 — history is preserved (never-delete principle)                 */
/* ------------------------------------------------------------------ */
test('19. history preserves every incident (never-delete)', async () => {
  const engine = new RollbackEngine({
    executor: async () => ({ ok: true }),
  });
  for (let i = 0; i < 5; i += 1) {
    await engine.autoRollback(`rel-${i}`, 'slo-breach');
  }
  const hist = engine.history();
  assert.equal(hist.incidents.length, 5);
  assert.equal(hist.total, 5);
  // Incidents are frozen — mutation attempts throw in strict mode
  assert.throws(() => {
    hist.incidents[0].outcome = 'modified';
  });
});

/* ------------------------------------------------------------------ */
/*  20 — metric function throwing does not crash watch()               */
/* ------------------------------------------------------------------ */
test('20. metric function throwing is isolated', () => {
  const engine = new RollbackEngine();
  engine.registerTrigger('broken', () => {
    throw new Error('metric backend down');
  }, 0.05, 30_000);

  const report = engine.watch('rel-1');
  assert.equal(report.ready, false);
  assert.equal(report.triggers[0].inBreach, false);
  assert.match(report.triggers[0].metricError || '', /metric backend down/);
});

/* ------------------------------------------------------------------ */
/*  21 — freeze() input validation                                     */
/* ------------------------------------------------------------------ */
test('21. freeze() validates start/end/reason', () => {
  const engine = new RollbackEngine();
  assert.throws(() => engine.freeze('a', 100, 'r'), /must be a number/);
  assert.throws(() => engine.freeze(100, 50, 'r'), /after/);
  assert.throws(() => engine.freeze(100, 200, ''), /cannot be empty/);
  engine.freeze(100, 200, 'maintenance');
  assert.equal(engine.isFrozen(150), true);
  assert.equal(engine.isFrozen(250), false);
});
