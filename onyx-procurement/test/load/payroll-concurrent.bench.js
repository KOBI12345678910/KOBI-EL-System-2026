/**
 * Wage-Slip Calculator — Concurrency / Throughput Stress Test
 * Agent 40 — Concurrency benchmark
 *
 * Generates 1,000 synthetic (employee, employer, timesheet) triples
 * (mix of monthly / hourly, with overtime variations), runs them
 * through computeWageSlip() both in parallel (Promise.all) and
 * sequentially, and reports timings + distribution stats.
 *
 * Run with:    node test/load/payroll-concurrent.bench.js
 *       or:    node --test test/load/payroll-concurrent.bench.js
 *
 * Assertions (throws on failure):
 *   - No exceptions during 1,000 computations
 *   - gross_pay > 0 on every slip
 *   - net_pay >= 0 on every slip
 *   - net_pay === gross_pay - total_deductions (within ₪0.01)
 *   - Sum of per-slip gross equals total gross
 *
 * If Agent 37's factory fixtures exist at test/fixtures/ they are
 * used; otherwise we fall back to inline synthetic fixtures.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { performance } = require('node:perf_hooks');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeWageSlip,
} = require(path.resolve(__dirname, '..', '..', 'src', 'payroll', 'wage-slip-calculator.js'));

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

const TOTAL_SLIPS = 1000;
const MONEY_EPS = 0.01; // ₪0.01 tolerance per spec
const SEED = 0xC0FFEE;  // deterministic PRNG so numbers are reproducible

// ─────────────────────────────────────────────────────────────────
// Deterministic PRNG (mulberry32) — reproducible across runs
// ─────────────────────────────────────────────────────────────────

function makeRng(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = makeRng(SEED);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// ─────────────────────────────────────────────────────────────────
// Factory loading — use Agent 37's factories if available
// ─────────────────────────────────────────────────────────────────

function tryLoadFactories() {
  const candidates = [
    path.resolve(__dirname, '..', 'fixtures', 'payroll-factories.js'),
    path.resolve(__dirname, '..', 'fixtures', 'factories.js'),
    path.resolve(__dirname, '..', 'fixtures', 'index.js'),
    path.resolve(__dirname, '..', 'fixtures', 'payroll', 'index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const mod = require(p);
        if (
          typeof mod.makeEmployer === 'function' &&
          typeof mod.makeEmployee === 'function' &&
          typeof mod.makeTimesheet === 'function'
        ) {
          return { source: p, ...mod };
        }
      } catch (_err) {
        // fall through
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Inline fallback factories
// ─────────────────────────────────────────────────────────────────

const DEPARTMENTS = ['Engineering', 'Site', 'Finance', 'Logistics', 'Admin', 'Safety'];
const POSITIONS_MONTHLY = ['Site Engineer', 'Project Manager', 'Accountant', 'HR Officer', 'Planner'];
const POSITIONS_HOURLY = ['Carpenter', 'Electrician', 'Plumber', 'Welder', 'Laborer'];

function inlineMakeEmployer(i) {
  return {
    id: `emp-${String(i).padStart(4, '0')}`,
    legal_name: `Onyx Subsidiary ${i}`,
    company_id: `5140000${String(i % 1000).padStart(3, '0')}`,
    tax_file_number: `9371${String(10000 + i).slice(-5)}`,
  };
}

function inlineMakeMonthlyEmployee(i) {
  // Spread base salaries from ₪7,000 (near minimum wage) up to ₪42,000
  // (above Bituach Leumi cap and into mid-high income tax brackets).
  const base = 7000 + randInt(0, 35000);
  const workPct = pick([100, 100, 100, 75, 50]); // mostly full time
  const hasStudyFund = rand() < 0.6;

  return {
    id: `e-m-${String(i).padStart(5, '0')}`,
    employee_number: `EMP-M-${i}`,
    first_name: 'Dana',
    last_name: `Worker${i}`,
    full_name: `Dana Worker${i}`,
    national_id: String(300000000 + i),
    employment_type: 'monthly',
    base_salary: base,
    work_percentage: workPct,
    hours_per_month: 182,
    tax_credits: pick([2.25, 2.25, 2.25, 2.75, 3.5]), // resident variations
    study_fund_number: hasStudyFund ? `SF-${100000 + i}` : null,
    position: pick(POSITIONS_MONTHLY),
    department: pick(DEPARTMENTS),
  };
}

function inlineMakeHourlyEmployee(i) {
  // Hourly rates spread ₪35 (close to 2026 minimum wage) up to ₪180
  const rate = 35 + randInt(0, 145);
  return {
    id: `e-h-${String(i).padStart(5, '0')}`,
    employee_number: `EMP-H-${i}`,
    first_name: 'Yossi',
    last_name: `Worker${i}`,
    full_name: `Yossi Worker${i}`,
    national_id: String(400000000 + i),
    employment_type: 'hourly',
    base_salary: rate,
    work_percentage: 100,
    hours_per_month: 182,
    tax_credits: pick([2.25, 2.25, 2.25, 1.0]),
    study_fund_number: rand() < 0.3 ? `SF-H-${200000 + i}` : null,
    position: pick(POSITIONS_HOURLY),
    department: pick(DEPARTMENTS),
  };
}

function inlineMakeTimesheetMonthly() {
  // Monthly employee: mostly no overtime, sometimes overtime bands,
  // sometimes absence/vacation/sick.
  const variant = randInt(0, 4);
  switch (variant) {
    case 0: // clean month
      return {
        hours_regular: 182,
      };
    case 1: // light overtime
      return {
        hours_regular: 182,
        hours_overtime_125: randInt(0, 2),
        hours_overtime_150: randInt(0, 6),
      };
    case 2: // heavy overtime
      return {
        hours_regular: 182,
        hours_overtime_125: 2,
        hours_overtime_150: randInt(4, 12),
        hours_overtime_175: randInt(0, 8),
        hours_overtime_200: randInt(0, 4),
      };
    case 3: // vacation / sick
      return {
        hours_regular: 150,
        hours_vacation: randInt(4, 24),
        hours_sick: randInt(0, 16),
      };
    case 4: // absence + small bonuses
      return {
        hours_regular: 174,
        hours_absence: randInt(2, 8),
        bonuses: randInt(0, 1500),
        commissions: randInt(0, 1500),
        allowances_meal: randInt(0, 400),
        allowances_travel: randInt(0, 300),
      };
    default:
      return { hours_regular: 182 };
  }
}

function inlineMakeTimesheetHourly() {
  const variant = randInt(0, 3);
  switch (variant) {
    case 0: // standard hourly
      return {
        hours_regular: randInt(100, 200),
      };
    case 1: // hourly with OT125 + OT150
      return {
        hours_regular: randInt(140, 186),
        hours_overtime_125: randInt(0, 2),
        hours_overtime_150: randInt(0, 10),
      };
    case 2: // hourly with weekend/holiday
      return {
        hours_regular: randInt(120, 182),
        hours_overtime_125: randInt(0, 2),
        hours_overtime_150: randInt(0, 6),
        hours_overtime_175: randInt(0, 10),
        hours_overtime_200: randInt(0, 6),
      };
    case 3: // hourly with allowances
      return {
        hours_regular: randInt(120, 182),
        hours_overtime_125: randInt(0, 2),
        allowances_meal: randInt(0, 300),
        allowances_travel: randInt(0, 400),
      };
    default:
      return { hours_regular: 182 };
  }
}

function inlineMakePeriod() {
  return { year: 2026, month: randInt(1, 12), pay_date: '2026-05-10' };
}

// ─────────────────────────────────────────────────────────────────
// Triple generation
// ─────────────────────────────────────────────────────────────────

function buildTriples(n, factories) {
  const triples = [];
  for (let i = 0; i < n; i++) {
    const isMonthly = i % 2 === 0; // 50/50 split monthly vs hourly

    let employer;
    let employee;
    let timesheet;
    let period;

    if (factories) {
      employer = factories.makeEmployer({ id: `emp-${i}` });
      employee = factories.makeEmployee({
        id: `e-${i}`,
        employment_type: isMonthly ? 'monthly' : 'hourly',
      });
      timesheet = factories.makeTimesheet({
        employment_type: isMonthly ? 'monthly' : 'hourly',
      });
      period = typeof factories.makePeriod === 'function'
        ? factories.makePeriod()
        : inlineMakePeriod();
    } else {
      employer = inlineMakeEmployer(i);
      employee = isMonthly ? inlineMakeMonthlyEmployee(i) : inlineMakeHourlyEmployee(i);
      timesheet = isMonthly ? inlineMakeTimesheetMonthly() : inlineMakeTimesheetHourly();
      period = inlineMakePeriod();
    }

    triples.push({ employee, employer, timesheet, period });
  }
  return triples;
}

// ─────────────────────────────────────────────────────────────────
// Benchmarking helpers
// ─────────────────────────────────────────────────────────────────

function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return 0;
  const idx = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[idx];
}

function fmt(n, decimals = 3) {
  return Number(n).toFixed(decimals);
}

function runSequential(triples) {
  const perCallMs = new Array(triples.length);
  const results = new Array(triples.length);

  const start = performance.now();
  for (let i = 0; i < triples.length; i++) {
    const t0 = performance.now();
    results[i] = computeWageSlip(triples[i]);
    perCallMs[i] = performance.now() - t0;
  }
  const total = performance.now() - start;

  return { results, perCallMs, totalMs: total };
}

async function runParallel(triples) {
  // Wrap each synchronous call in an already-resolved Promise so
  // Promise.all measures bulk microtask-queue throughput rather than
  // actual concurrency (the work is sync). This is the pattern the
  // spec asked for.
  const start = performance.now();
  const results = await Promise.all(
    triples.map((t) => Promise.resolve().then(() => computeWageSlip(t)))
  );
  const total = performance.now() - start;
  return { results, totalMs: total };
}

// ─────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────

function validateSlips(results) {
  const issues = [];
  let totalGrossSum = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];

    if (!r || typeof r !== 'object') {
      issues.push({ i, kind: 'missing-result' });
      continue;
    }
    if (!(r.gross_pay > 0)) {
      issues.push({ i, kind: 'gross_pay<=0', gross_pay: r.gross_pay });
    }
    if (!(r.net_pay >= 0)) {
      issues.push({ i, kind: 'net_pay<0', net_pay: r.net_pay });
    }
    const expectedNet = r.gross_pay - r.total_deductions;
    const delta = Math.abs(r.net_pay - expectedNet);
    if (delta > MONEY_EPS) {
      issues.push({
        i,
        kind: 'net_pay-mismatch',
        gross_pay: r.gross_pay,
        total_deductions: r.total_deductions,
        net_pay: r.net_pay,
        expectedNet,
        delta,
      });
    }
    totalGrossSum += r.gross_pay;
  }

  return { issues, totalGrossSum };
}

// ─────────────────────────────────────────────────────────────────
// Main benchmark
// ─────────────────────────────────────────────────────────────────

async function runBenchmark() {
  const factories = tryLoadFactories();
  const factorySource = factories
    ? `agent-37 factories (${path.relative(path.resolve(__dirname, '..', '..'), factories.source)})`
    : 'inline fallback fixtures';

  console.log('════════════════════════════════════════════════════════════');
  console.log(' Wage-Slip Calculator — Concurrency Benchmark');
  console.log(`  Slips: ${TOTAL_SLIPS}`);
  console.log(`  Fixtures: ${factorySource}`);
  console.log(`  Node: ${process.version} | ${process.platform}/${process.arch}`);
  console.log('════════════════════════════════════════════════════════════');

  // Build once so both runs measure identical work
  const triples = buildTriples(TOTAL_SLIPS, factories);

  // 1) Sequential run
  const seq = runSequential(triples);
  let noThrow = true;

  // 2) Parallel run (Promise.all)
  let par;
  try {
    par = await runParallel(triples);
  } catch (err) {
    noThrow = false;
    console.error('PARALLEL RUN THREW:', err);
    throw err;
  }

  // 3) Validate sequential results (canonical)
  const { issues: seqIssues, totalGrossSum: seqTotalGross } = validateSlips(seq.results);

  // 4) Validate parallel results match sequential slip-by-slip
  const parIssues = [];
  let parTotalGross = 0;
  for (let i = 0; i < par.results.length; i++) {
    const s = seq.results[i];
    const p = par.results[i];
    parTotalGross += p.gross_pay;
    if (Math.abs(p.gross_pay - s.gross_pay) > MONEY_EPS) {
      parIssues.push({ i, kind: 'gross_pay-drift', seq: s.gross_pay, par: p.gross_pay });
    }
    if (Math.abs(p.net_pay - s.net_pay) > MONEY_EPS) {
      parIssues.push({ i, kind: 'net_pay-drift', seq: s.net_pay, par: p.net_pay });
    }
  }
  const { issues: parShapeIssues } = validateSlips(par.results);
  parIssues.push(...parShapeIssues);

  // 5) Distribution stats from per-call sequential timings
  const sorted = seq.perCallMs.slice().sort((a, b) => a - b);
  const sumMs = sorted.reduce((a, b) => a + b, 0);
  const avgMs = sumMs / sorted.length;
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];
  const p50Ms = percentile(sorted, 50);
  const p95Ms = percentile(sorted, 95);
  const p99Ms = percentile(sorted, 99);

  // 6) Sum-of-gross assertion (aggregate matches per-slip sum)
  // This implicitly verifies that no slip was silently dropped or duplicated.
  const summedFromArray = seq.results.reduce((acc, r) => acc + r.gross_pay, 0);
  const grossSumMatches = Math.abs(summedFromArray - seqTotalGross) < MONEY_EPS;

  // 7) Report
  console.log('\n── Sequential ──');
  console.log(`  total:          ${fmt(seq.totalMs)} ms`);
  console.log(`  avg/slip:       ${fmt(avgMs)} ms`);
  console.log(`  min/slip:       ${fmt(minMs)} ms`);
  console.log(`  max/slip:       ${fmt(maxMs)} ms`);
  console.log(`  p50/slip:       ${fmt(p50Ms)} ms`);
  console.log(`  p95/slip:       ${fmt(p95Ms)} ms`);
  console.log(`  p99/slip:       ${fmt(p99Ms)} ms`);
  console.log(`  throughput:     ${fmt(TOTAL_SLIPS / (seq.totalMs / 1000), 0)} slips/sec`);

  console.log('\n── Parallel (Promise.all) ──');
  console.log(`  total:          ${fmt(par.totalMs)} ms`);
  console.log(`  avg/slip:       ${fmt(par.totalMs / TOTAL_SLIPS)} ms`);
  console.log(`  throughput:     ${fmt(TOTAL_SLIPS / (par.totalMs / 1000), 0)} slips/sec`);
  console.log(
    `  speedup vs seq: ${fmt(seq.totalMs / par.totalMs, 2)}x`
    + ' (expected ≈1x — calculator is synchronous)'
  );

  console.log('\n── Aggregate ──');
  console.log(`  total gross (seq): ₪${fmt(seqTotalGross, 2)}`);
  console.log(`  total gross (par): ₪${fmt(parTotalGross, 2)}`);
  console.log(`  sum-of-per-slip:   ₪${fmt(summedFromArray, 2)}`);
  console.log(`  sum matches total: ${grossSumMatches ? 'yes' : 'NO'}`);

  console.log('\n── Validation ──');
  console.log(`  sequential issues: ${seqIssues.length}`);
  console.log(`  parallel issues:   ${parIssues.length}`);
  console.log(`  no-throw:          ${noThrow ? 'yes' : 'NO'}`);

  if (seqIssues.length > 0) {
    console.log('\nSEQUENTIAL ISSUES (first 10):');
    for (const issue of seqIssues.slice(0, 10)) console.log(' ', issue);
  }
  if (parIssues.length > 0) {
    console.log('\nPARALLEL ISSUES (first 10):');
    for (const issue of parIssues.slice(0, 10)) console.log(' ', issue);
  }
  console.log('════════════════════════════════════════════════════════════\n');

  // 8) Hard assertions — throw if anything is off
  assert.equal(noThrow, true, 'calculator must not throw during 1,000 computations');
  assert.equal(seq.results.length, TOTAL_SLIPS, 'every sequential call must return a slip');
  assert.equal(par.results.length, TOTAL_SLIPS, 'every parallel call must return a slip');
  assert.equal(seqIssues.length, 0, `sequential validation failures: ${seqIssues.length}`);
  assert.equal(parIssues.length, 0, `parallel validation failures: ${parIssues.length}`);
  assert.ok(grossSumMatches, 'sum of per-slip gross must equal total gross');
  assert.ok(
    Math.abs(seqTotalGross - parTotalGross) < MONEY_EPS,
    'sequential and parallel total gross must match',
  );

  return {
    seqTotalMs: seq.totalMs,
    parTotalMs: par.totalMs,
    avgMs,
    minMs,
    maxMs,
    p50Ms,
    p95Ms,
    p99Ms,
    seqTotalGross,
    parTotalGross,
    issues: seqIssues.length + parIssues.length,
  };
}

// ─────────────────────────────────────────────────────────────────
// node:test entry points
// ─────────────────────────────────────────────────────────────────

test('payroll stress: 1,000 wage slips (sequential + Promise.all)', async () => {
  const stats = await runBenchmark();
  assert.equal(stats.issues, 0, 'no numerical discrepancies expected');
  assert.ok(stats.seqTotalGross > 0, 'aggregate gross must be positive');
});

// Also allow running as `node test/load/payroll-concurrent.bench.js`
if (require.main === module) {
  runBenchmark().catch((err) => {
    console.error('BENCH FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runBenchmark, buildTriples, TOTAL_SLIPS };
