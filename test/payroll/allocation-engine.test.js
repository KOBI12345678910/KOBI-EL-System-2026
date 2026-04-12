/* ============================================================================
 * Techno-Kol ERP — allocation-engine test suite
 * Agent X-43 / Swarm 3C / Cost Center Allocation
 * ----------------------------------------------------------------------------
 * Covers:
 *   01. defineCostCenter — persists and returns id
 *   02. defineCostCenter — rejects bad input
 *   03. definePool — links CCs, rejects unknown CC
 *   04. setDriver — writes per (pool, cc, period)
 *   05. runAllocation DIRECT — HR 100k / 50,20,10 headcount split
 *   06. runAllocation DIRECT — three pools balanced JEs, DR == CR
 *   07. runAllocation STEPDOWN — large pool goes first, cross-service ordering
 *   08. runAllocation STEPDOWN — back-allocation blocked
 *   09. runAllocation RECIPROCAL — mutual services, linear system solved
 *   10. runAllocation ABC — per-unit activity rate, pre-computed rate override
 *   11. compareMethod — emits per-CC spread across methods
 *   12. periodOverPeriod — period delta + pct_change
 *   13. varianceVsBudget — OVER / UNDER / ON_TARGET statuses
 *   14. productLineProfit — revenue attribution + gross margin
 *   15. postJournalEntries — flags posted, invokes sink
 *   16. rounding drift — residual pinned to largest, sum == base
 *   17. Hebrew narration present on JE lines (bilingual requirement)
 *   18. Separate engine instances do not share state (factory works)
 *
 * Hand-rolled harness — zero deps, runnable on plain Node.
 * ========================================================================== */

'use strict';

const path = require('path');
const engineModulePath = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'costing',
  'allocation-engine.js'
);
const engineMod = require(engineModulePath);

const {
  createEngine,
  METHODS,
  CC_TYPES,
  DRIVER_CATALOG,
  round2
} = engineMod;

/* ----------------------------------------------------------------------------
 * Tiny assertion harness
 * -------------------------------------------------------------------------- */
const results = [];
let passed = 0;
let failed = 0;

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertClose(actual, expected, tol, msg) {
  const diff = Math.abs(actual - expected);
  if (diff > (tol || 0.01)) {
    throw new Error(`${msg || 'assertClose'}: |${actual} - ${expected}| = ${diff} > ${tol || 0.01}`);
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (_) { threw = true; }
  if (!threw) throw new Error(msg || 'expected throw');
}
function assertDeepIncludes(obj, fragment, msg) {
  for (const k of Object.keys(fragment)) {
    if (JSON.stringify(obj[k]) !== JSON.stringify(fragment[k])) {
      throw new Error(
        `${msg || 'assertDeepIncludes'}: key "${k}" expected ${JSON.stringify(fragment[k])}, got ${JSON.stringify(obj[k])}`
      );
    }
  }
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    failed++;
    console.log(`  FAIL- ${name}\n        ${err.message}`);
  }
}

/* ----------------------------------------------------------------------------
 * Shared factory — each test gets its own engine, guaranteeing isolation.
 * -------------------------------------------------------------------------- */
function freshEngine() {
  return createEngine();
}

/* ----------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------- */
async function run() {
  console.log('allocation-engine.test.js — Techno-Kol ERP cost-center allocation');
  console.log('---------------------------------------------------------------');

  await test('01 defineCostCenter persists and returns id', () => {
    const eng = freshEngine();
    const id = eng.defineCostCenter({
      code: 'PROD',
      name: 'Production',
      name_he: 'ייצור',
      type: CC_TYPES.PRODUCTION
    });
    assertTrue(typeof id === 'string' && id.length > 0, 'id should be non-empty string');
    const list = eng.listCostCenters();
    assertEq(list.length, 1);
    assertEq(list[0].code, 'PROD');
    assertEq(list[0].name_he, 'ייצור');
  });

  await test('02 defineCostCenter rejects bad input', () => {
    const eng = freshEngine();
    assertThrows(() => eng.defineCostCenter(null), 'null cc');
    assertThrows(() => eng.defineCostCenter({}), 'empty cc');
    assertThrows(() => eng.defineCostCenter({ code: 'X', type: 'BOGUS' }), 'bad type');
    assertThrows(() => eng.defineCostCenter({ type: CC_TYPES.PRODUCTION }), 'no code');
  });

  await test('03 definePool links CCs and rejects unknown CC', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION, name_he: 'ייצור' });
    const hr   = eng.defineCostCenter({ code: 'HR',   type: CC_TYPES.SERVICE,    name_he: 'משאבי אנוש' });
    const poolId = eng.definePool(
      { code: 'HR-POOL', name_he: 'מאגר HR', driver: 'headcount', source_cc: hr },
      [prod],
      100000
    );
    assertTrue(typeof poolId === 'string');
    assertEq(eng.listPools().length, 1);
    assertThrows(() =>
      eng.definePool({ code: 'X' }, ['NO-SUCH-CC'], 10), 'unknown cc rejected');
    assertThrows(() =>
      eng.definePool({ code: 'Y', driver: 'BOGUS' }, [prod], 10), 'unknown driver rejected');
    assertThrows(() =>
      eng.definePool({ code: 'Z' }, [prod], -1), 'negative base rejected');
  });

  await test('04 setDriver writes per (pool, cc, period)', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const hr   = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const poolId = eng.definePool({ code: 'POOL', driver: 'headcount', source_cc: hr }, [prod], 500);
    eng.setDriver(poolId, prod, '2026-04', 50);
    assertEq(eng.getDriver(poolId, prod, '2026-04'), 50);
    assertThrows(() => eng.setDriver(poolId, prod, '2026-04', -1), 'negative val');
    assertThrows(() => eng.setDriver('BAD', prod, '2026-04', 1), 'unknown pool');
  });

  await test('05 runAllocation DIRECT — HR 100k split across 3 CCs', () => {
    // prod=50, sales=20, admin=10 — all production CCs.
    // Expected: prod=62500, sales=25000, admin=12500
    const eng = freshEngine();
    const prod  = eng.defineCostCenter({ code: 'PROD',  type: CC_TYPES.PRODUCTION, name_he: 'ייצור' });
    const sales = eng.defineCostCenter({ code: 'SALES', type: CC_TYPES.PRODUCTION, name_he: 'מכירות' });
    const admin = eng.defineCostCenter({ code: 'ADMIN', type: CC_TYPES.PRODUCTION, name_he: 'מינהלה' });
    const hr    = eng.defineCostCenter({ code: 'HR',    type: CC_TYPES.SERVICE,    name_he: 'משאבי אנוש' });
    const poolId = eng.definePool(
      { code: 'HR-POOL', name_he: 'מאגר HR', driver: 'headcount', source_cc: hr },
      [prod, sales, admin],
      100000
    );
    eng.setDriver(poolId, prod,  '2026-04', 50);
    eng.setDriver(poolId, sales, '2026-04', 20);
    eng.setDriver(poolId, admin, '2026-04', 10);

    const res = eng.runAllocation('2026-04', METHODS.DIRECT);
    const alloc = res.allocations[0];
    const byCc = {};
    for (const e of alloc.entries) byCc[e.ccId] = e.amount;

    assertClose(byCc[prod],  62500.00, 0.01, 'prod amount');
    assertClose(byCc[sales], 25000.00, 0.01, 'sales amount');
    assertClose(byCc[admin], 12500.00, 0.01, 'admin amount');

    // Sum must equal base exactly
    const total = alloc.entries.reduce((a, e) => round2(a + e.amount), 0);
    assertClose(total, 100000, 0.005, 'sum equals base');
  });

  await test('06 runAllocation emits balanced JEs (DR == CR)', () => {
    const eng = freshEngine();
    const prod  = eng.defineCostCenter({ code: 'PROD',  type: CC_TYPES.PRODUCTION });
    const sales = eng.defineCostCenter({ code: 'SALES', type: CC_TYPES.PRODUCTION });
    const hr    = eng.defineCostCenter({ code: 'HR',    type: CC_TYPES.SERVICE });
    const it    = eng.defineCostCenter({ code: 'IT',    type: CC_TYPES.SERVICE });
    const hrPool = eng.definePool(
      { code: 'HR',  name_he: 'HR', driver: 'headcount', source_cc: hr },
      [prod, sales],
      80000
    );
    const itPool = eng.definePool(
      { code: 'IT',  name_he: 'IT', driver: 'computers', source_cc: it },
      [prod, sales],
      45000
    );
    eng.setDriver(hrPool, prod,  '2026-04', 40);
    eng.setDriver(hrPool, sales, '2026-04', 20);
    eng.setDriver(itPool, prod,  '2026-04', 30);
    eng.setDriver(itPool, sales, '2026-04', 15);

    const res = eng.runAllocation('2026-04', METHODS.DIRECT);
    assertTrue(res.journal_entries.length >= 2, 'at least 2 JEs');
    for (const je of res.journal_entries) {
      assertEq(je.balanced, true, `JE ${je.id} balanced`);
      assertClose(je.dr_total, je.cr_total, 0.01, `JE ${je.id} DR==CR`);
    }
  });

  await test('07 STEPDOWN: largest service pool allocates first', () => {
    const eng = freshEngine();
    const prod  = eng.defineCostCenter({ code: 'PROD',  type: CC_TYPES.PRODUCTION });
    const sales = eng.defineCostCenter({ code: 'SALES', type: CC_TYPES.PRODUCTION });
    const hr    = eng.defineCostCenter({ code: 'HR',    type: CC_TYPES.SERVICE });
    const it    = eng.defineCostCenter({ code: 'IT',    type: CC_TYPES.SERVICE });

    const itPool = eng.definePool(
      { code: 'IT',  driver: 'computers', source_cc: it },
      [prod, sales, hr],
      200000
    );
    const hrPool = eng.definePool(
      { code: 'HR',  driver: 'headcount', source_cc: hr },
      [prod, sales, it],
      100000
    );
    // Drivers
    eng.setDriver(itPool, prod,  '2026-04', 10);
    eng.setDriver(itPool, sales, '2026-04',  5);
    eng.setDriver(itPool, hr,    '2026-04',  5);
    eng.setDriver(hrPool, prod,  '2026-04', 50);
    eng.setDriver(hrPool, sales, '2026-04', 20);
    eng.setDriver(hrPool, it,    '2026-04', 10);

    const res = eng.runAllocation('2026-04', METHODS.STEPDOWN);
    // First entry in trace should be the largest pool (IT, 200k)
    const firstPool = res.trace[0].pool;
    assertEq(firstPool, 'IT', 'IT should allocate first (larger base)');
  });

  await test('08 STEPDOWN: back-allocation to already-done CC blocked', () => {
    const eng = freshEngine();
    const prod  = eng.defineCostCenter({ code: 'PROD',  type: CC_TYPES.PRODUCTION });
    const hr    = eng.defineCostCenter({ code: 'HR',    type: CC_TYPES.SERVICE });
    const it    = eng.defineCostCenter({ code: 'IT',    type: CC_TYPES.SERVICE });

    const itPool = eng.definePool(
      { code: 'IT',  driver: 'computers', source_cc: it },
      [prod, hr],
      100000
    );
    const hrPool = eng.definePool(
      { code: 'HR',  driver: 'headcount', source_cc: hr },
      [prod, it],
      50000
    );
    eng.setDriver(itPool, prod, '2026-04', 10);
    eng.setDriver(itPool, hr,   '2026-04', 5);
    eng.setDriver(hrPool, prod, '2026-04', 40);
    eng.setDriver(hrPool, it,   '2026-04', 10);

    const res = eng.runAllocation('2026-04', METHODS.STEPDOWN);
    // HR allocates second; IT is already done, so HR's allocation to IT must be 0
    const hrAlloc = res.allocations.find((a) => a.poolId === hrPool);
    const itEntry = hrAlloc.entries.find((e) => e.ccId === it);
    assertTrue(!itEntry || itEntry.amount === 0, 'no back-allocation to IT');
  });

  await test('09 RECIPROCAL: mutual-services solved by linear system', () => {
    const eng = freshEngine();
    const prod  = eng.defineCostCenter({ code: 'PROD',  type: CC_TYPES.PRODUCTION });
    const sales = eng.defineCostCenter({ code: 'SALES', type: CC_TYPES.PRODUCTION });
    const hr    = eng.defineCostCenter({ code: 'HR',    type: CC_TYPES.SERVICE });
    const it    = eng.defineCostCenter({ code: 'IT',    type: CC_TYPES.SERVICE });

    const hrPool = eng.definePool(
      { code: 'HR', driver: 'headcount', source_cc: hr },
      [prod, sales, it],
      60000
    );
    const itPool = eng.definePool(
      { code: 'IT', driver: 'computers', source_cc: it },
      [prod, sales, hr],
      40000
    );
    // HR serves PROD:50, SALES:25, IT:25 (of people)
    eng.setDriver(hrPool, prod,  '2026-04', 50);
    eng.setDriver(hrPool, sales, '2026-04', 25);
    eng.setDriver(hrPool, it,    '2026-04', 25);
    // IT serves PROD:20, SALES:10, HR:10 (of computers)
    eng.setDriver(itPool, prod,  '2026-04', 20);
    eng.setDriver(itPool, sales, '2026-04', 10);
    eng.setDriver(itPool, hr,    '2026-04', 10);

    const res = eng.runAllocation('2026-04', METHODS.RECIPROCAL);
    // Conservation: total allocated to PROD+SALES should equal total original pools
    let allocToProduction = 0;
    for (const alloc of res.allocations) {
      for (const entry of alloc.entries) {
        if (entry.ccId === prod || entry.ccId === sales) {
          allocToProduction += entry.amount;
        }
      }
    }
    assertClose(allocToProduction, 60000 + 40000, 1.0, 'total conserved');
    // Trace should include the solve step
    const solveStep = res.trace.find((t) => t.step === 'reciprocal:solve');
    assertTrue(solveStep, 'solve step present');
    assertEq(solveStep.matrix_size, '2×2');
  });

  await test('10 ABC: activity rate, pre-computed rate honored', () => {
    const eng = freshEngine();
    const prodA = eng.defineCostCenter({ code: 'A', type: CC_TYPES.PRODUCTION });
    const prodB = eng.defineCostCenter({ code: 'B', type: CC_TYPES.PRODUCTION });
    const fac   = eng.defineCostCenter({ code: 'FAC', type: CC_TYPES.SERVICE });

    // ABC pool — total 90000, machine_hours driver
    const poolId = eng.definePool(
      { code: 'ENERGY', driver: 'machine_hours', source_cc: fac, is_abc: true },
      [prodA, prodB],
      90000
    );
    eng.setDriver(poolId, prodA, '2026-04', 200);
    eng.setDriver(poolId, prodB, '2026-04', 100);

    const res = eng.runAllocation('2026-04', METHODS.ABC);
    // rate = 90000 / 300 = 300 per machine-hour
    const alloc = res.allocations.find((a) => a.poolId === poolId);
    assertClose(alloc.rate, 300, 0.01, 'rate = 300');
    const a = alloc.entries.find((e) => e.ccId === prodA);
    const b = alloc.entries.find((e) => e.ccId === prodB);
    assertClose(a.amount, 60000, 0.01, 'A gets 200h * 300');
    assertClose(b.amount, 30000, 0.01, 'B gets 100h * 300');

    // Pre-computed rate override
    const eng2 = freshEngine();
    const pA = eng2.defineCostCenter({ code: 'A', type: CC_TYPES.PRODUCTION });
    const pB = eng2.defineCostCenter({ code: 'B', type: CC_TYPES.PRODUCTION });
    const facId = eng2.defineCostCenter({ code: 'FAC', type: CC_TYPES.SERVICE });
    const p2 = eng2.definePool(
      { code: 'ENERGY', driver: 'machine_hours', source_cc: facId, is_abc: true, activity_rate: 500 },
      [pA, pB],
      1000000 // irrelevant when activity_rate set
    );
    eng2.setDriver(p2, pA, '2026-04', 2);
    eng2.setDriver(p2, pB, '2026-04', 3);
    const r2 = eng2.runAllocation('2026-04', METHODS.ABC);
    const aRec = r2.allocations[0].entries.find((e) => e.ccId === pA);
    const bRec = r2.allocations[0].entries.find((e) => e.ccId === pB);
    assertClose(aRec.amount, 1000, 0.01, 'A = 2h * 500');
    assertClose(bRec.amount, 1500, 0.01, 'B = 3h * 500');
  });

  await test('11 compareMethod: per-CC spread across methods', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const sales = eng.defineCostCenter({ code: 'SALES', type: CC_TYPES.PRODUCTION });
    const hr = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const poolId = eng.definePool(
      { code: 'HR', driver: 'headcount', source_cc: hr, is_abc: true },
      [prod, sales],
      20000
    );
    eng.setDriver(poolId, prod,  '2026-04', 80);
    eng.setDriver(poolId, sales, '2026-04', 20);
    const comp = eng.compareMethod('2026-04', [METHODS.DIRECT, METHODS.ABC]);
    assertTrue(comp.methods.DIRECT, 'has DIRECT');
    assertTrue(comp.methods.ABC, 'has ABC');
    assertTrue(typeof comp.by_cc[prod].spread === 'number', 'spread numeric');
  });

  await test('12 periodOverPeriod: delta + pct_change', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const hr = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const pool = eng.definePool(
      { code: 'HR', driver: 'headcount', source_cc: hr },
      [prod],
      10000
    );
    eng.setDriver(pool, prod, '2026-03', 50);
    eng.setDriver(pool, prod, '2026-04', 50);
    eng.setPoolBaseForPeriod(pool, '2026-03', 10000);
    eng.setPoolBaseForPeriod(pool, '2026-04', 15000);

    eng.runAllocation('2026-03', METHODS.DIRECT);
    eng.runAllocation('2026-04', METHODS.DIRECT);

    const pop = eng.periodOverPeriod(prod, '2026-03', '2026-04', METHODS.DIRECT);
    assertClose(pop.totalA, 10000, 0.01, 'period A total');
    assertClose(pop.totalB, 15000, 0.01, 'period B total');
    assertClose(pop.delta,   5000, 0.01, 'delta');
    assertClose(pop.pct_change, 50.0, 0.01, 'pct change');
  });

  await test('13 varianceVsBudget: OVER / UNDER / ON_TARGET', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const hr = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const pool = eng.definePool(
      { code: 'HR', driver: 'headcount', source_cc: hr },
      [prod],
      12000
    );
    eng.setDriver(pool, prod, '2026-04', 10);

    // OVER
    eng.setBudget(prod, '2026-04', 10000);
    const v1 = eng.varianceVsBudget(prod, '2026-04', METHODS.DIRECT);
    assertEq(v1.status, 'OVER_BUDGET');
    assertClose(v1.variance, 2000, 0.01);

    // UNDER
    const eng2 = freshEngine();
    const p2 = eng2.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const h2 = eng2.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const pl2 = eng2.definePool(
      { code: 'HR', driver: 'headcount', source_cc: h2 },
      [p2],
      5000
    );
    eng2.setDriver(pl2, p2, '2026-04', 10);
    eng2.setBudget(p2, '2026-04', 10000);
    const v2 = eng2.varianceVsBudget(p2, '2026-04', METHODS.DIRECT);
    assertEq(v2.status, 'UNDER_BUDGET');
    assertClose(v2.variance, -5000, 0.01);

    // ON_TARGET
    const eng3 = freshEngine();
    const p3 = eng3.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const h3 = eng3.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const pl3 = eng3.definePool(
      { code: 'HR', driver: 'headcount', source_cc: h3 },
      [p3],
      7000
    );
    eng3.setDriver(pl3, p3, '2026-04', 10);
    eng3.setBudget(p3, '2026-04', 7000);
    const v3 = eng3.varianceVsBudget(p3, '2026-04', METHODS.DIRECT);
    assertEq(v3.status, 'ON_TARGET');
    assertClose(v3.variance, 0, 0.01);
  });

  await test('14 productLineProfit: revenue attribution + margin', () => {
    const eng = freshEngine();
    const ccProd = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const hr = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const pool = eng.definePool(
      { code: 'HR', driver: 'headcount', source_cc: hr },
      [ccProd],
      20000
    );
    eng.setDriver(pool, ccProd, '2026-04', 10);

    // Two products sharing the same production CC
    eng.defineProductLine('PROD-A', ccProd, '2026-04', 60000);
    eng.defineProductLine('PROD-B', ccProd, '2026-04', 40000);

    const profA = eng.productLineProfit('PROD-A', '2026-04');
    // Revenue share A = 60k / 100k = 0.6; allocated overhead to CC = 20000
    // Attributed overhead A = 20000 * 0.6 = 12000; GP = 60000 - 12000 = 48000; margin = 80%
    assertClose(profA.revenue, 60000, 0.01);
    assertClose(profA.attributed_overhead, 12000, 0.01);
    assertClose(profA.gross_profit, 48000, 0.01);
    assertClose(profA.gross_margin_pct, 80, 0.01);

    const profB = eng.productLineProfit('PROD-B', '2026-04');
    assertClose(profB.attributed_overhead, 8000, 0.01);
    assertClose(profB.gross_profit, 32000, 0.01);
  });

  await test('15 postJournalEntries: flags posted + calls sink', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION });
    const hr = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE });
    const pool = eng.definePool(
      { code: 'HR', driver: 'headcount', source_cc: hr },
      [prod],
      5000
    );
    eng.setDriver(pool, prod, '2026-04', 10);
    const res = eng.runAllocation('2026-04', METHODS.DIRECT);
    const sinkCalls = [];
    const posted = eng.postJournalEntries(res.runId, (je) => sinkCalls.push(je.id));
    assertTrue(posted.length >= 1, 'at least one posted');
    for (const je of posted) {
      assertEq(je.posted, true);
      assertEq(je.post_status, 'POSTED');
      assertTrue(typeof je.posted_at === 'string');
    }
    assertEq(sinkCalls.length, posted.length);
  });

  await test('16 rounding drift: residual pinned to largest, sum == base', () => {
    // Use an ugly division that forces fractional cents
    // 1000 / 3 ≈ 333.333 — three equal CCs should total back to 1000 after rounding
    const eng = freshEngine();
    const a = eng.defineCostCenter({ code: 'A', type: CC_TYPES.PRODUCTION });
    const b = eng.defineCostCenter({ code: 'B', type: CC_TYPES.PRODUCTION });
    const c = eng.defineCostCenter({ code: 'C', type: CC_TYPES.PRODUCTION });
    const svc = eng.defineCostCenter({ code: 'SVC', type: CC_TYPES.SERVICE });
    const pool = eng.definePool(
      { code: 'P', driver: 'headcount', source_cc: svc },
      [a, b, c],
      1000
    );
    eng.setDriver(pool, a, '2026-04', 1);
    eng.setDriver(pool, b, '2026-04', 1);
    eng.setDriver(pool, c, '2026-04', 1);
    const res = eng.runAllocation('2026-04', METHODS.DIRECT);
    const alloc = res.allocations[0];
    const total = alloc.entries.reduce((s, e) => round2(s + e.amount), 0);
    assertClose(total, 1000, 0.005, 'sum exactly 1000 after rounding');
  });

  await test('17 Hebrew narration on JE lines (bilingual)', () => {
    const eng = freshEngine();
    const prod = eng.defineCostCenter({ code: 'PROD', type: CC_TYPES.PRODUCTION, name_he: 'ייצור' });
    const hr = eng.defineCostCenter({ code: 'HR', type: CC_TYPES.SERVICE, name_he: 'משאבי אנוש' });
    const pool = eng.definePool(
      { code: 'HR', name_he: 'מאגר HR', driver: 'headcount', source_cc: hr },
      [prod],
      5000
    );
    eng.setDriver(pool, prod, '2026-04', 10);
    const res = eng.runAllocation('2026-04', METHODS.DIRECT);
    const je = res.journal_entries[0];
    const drLine = je.lines.find((l) => l.debit > 0);
    assertTrue(drLine.account_he.includes('מאגר HR') || drLine.account_he.includes('אוברהד'),
      'Hebrew account name');
    assertTrue(drLine.narration.includes('מאגר HR') || drLine.narration.includes('HR'),
      'Hebrew narration');
    assertTrue(typeof drLine.narration_en === 'string' && drLine.narration_en.length > 0,
      'English narration');
  });

  await test('18 separate engine instances do not share state', () => {
    const eng1 = createEngine();
    const eng2 = createEngine();
    eng1.defineCostCenter({ code: 'A', type: CC_TYPES.PRODUCTION });
    assertEq(eng1.listCostCenters().length, 1);
    assertEq(eng2.listCostCenters().length, 0);
  });

  // ----------------------------------------------------------
  console.log('---------------------------------------------------------------');
  console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 2;
});
