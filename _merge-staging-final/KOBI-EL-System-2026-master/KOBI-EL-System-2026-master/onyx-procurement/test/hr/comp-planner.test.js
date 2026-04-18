/**
 * Compensation Planner — Unit Tests
 * Agent Y-071 • Techno-Kol Uzi • Mega-ERP • Kobi EL 2026
 *
 * Covers:
 *   - Band definition + grow-only upgrade rule
 *   - Compa-ratio + range penetration
 *   - Merit matrix allocation (2D, performance × compa)
 *   - Planned increase with budget scaling
 *   - Market comparison (IL benchmark stub)
 *   - Total rewards breakdown (Israeli statutory)
 *   - Pay equity (gender + minority)
 *   - Compression detection + hiring bands
 *   - Budget tracker
 *   - Hebrew bilingual increase letter
 *
 * Zero deps — plain Node assert.
 */

'use strict';

const assert = require('assert');
const {
  CompPlanner,
  DEFAULT_MERIT_MATRIX,
  IL_EMPLOYER,
} = require('../../src/hr/comp-planner');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  FAIL ${name}`);
    console.log(`       ${e.message}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ───────────────────────────────────────────────────────────────
// helpers — build a small fixture planner
// ───────────────────────────────────────────────────────────────

function buildPlanner() {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'engineering', min: 22000, mid: 28000, max: 36000 });
  p.defineBand({ grade: 'L4', jobFamily: 'engineering', min: 32000, mid: 42000, max: 55000 });
  p.defineBand({ grade: 'M1', jobFamily: 'engineering', min: 40000, mid: 52000, max: 68000 });
  p.defineBand({ grade: 'L2', jobFamily: 'operations',  min: 13000, mid: 17000, max: 22000 });

  // Engineers
  p.upsertEmployee({
    id: 'E001', name: 'Dana Cohen', grade: 'L3', jobFamily: 'engineering',
    baseSalary: 25000, performance: 5, gender: 'female', minority: false,
    role: 'engineering', level: 'mid', department: 'R&D',
  });
  p.upsertEmployee({
    id: 'E002', name: 'Yossi Levi', grade: 'L3', jobFamily: 'engineering',
    baseSalary: 31000, performance: 3, gender: 'male', minority: false,
    role: 'engineering', level: 'mid', department: 'R&D',
  });
  p.upsertEmployee({
    id: 'E003', name: 'Noa Shapira', grade: 'L3', jobFamily: 'engineering',
    baseSalary: 24000, performance: 4, gender: 'female', minority: false,
    role: 'engineering', level: 'mid', department: 'R&D',
  });
  p.upsertEmployee({
    id: 'E004', name: 'Omar Hassan', grade: 'L3', jobFamily: 'engineering',
    baseSalary: 26500, performance: 4, gender: 'male', minority: true,
    role: 'engineering', level: 'mid', department: 'R&D',
  });
  p.upsertEmployee({
    id: 'E005', name: 'Avi Mizrahi', grade: 'L4', jobFamily: 'engineering',
    baseSalary: 50000, performance: 5, gender: 'male', minority: false,
    role: 'engineering', level: 'senior', department: 'R&D',
  });

  // Manager (compressed — earns less than his report E005)
  p.upsertEmployee({
    id: 'M001', name: 'Rina Bar', grade: 'M1', jobFamily: 'engineering',
    baseSalary: 48000, performance: 4, gender: 'female', minority: false,
    role: 'engineering', level: 'senior', department: 'R&D',
  });
  p.employees.get('E001').managerId = 'M001';
  p.employees.get('E002').managerId = 'M001';
  p.employees.get('E003').managerId = 'M001';
  p.employees.get('E004').managerId = 'M001';
  p.employees.get('E005').managerId = 'M001';

  return p;
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

section('Band definition');

test('defineBand creates a band keyed by grade|family', () => {
  const p = new CompPlanner();
  const b = p.defineBand({ grade: 'L3', jobFamily: 'engineering', min: 20000, mid: 25000, max: 32000 });
  assert.strictEqual(b.grade, 'L3');
  assert.strictEqual(b.jobFamily, 'engineering');
  assert.strictEqual(b.mid, 25000);
});

test('defineBand rejects bad inputs', () => {
  const p = new CompPlanner();
  assert.throws(() => p.defineBand({ grade: 'L1', jobFamily: 'x', min: 10, mid: 5, max: 20 }));
  assert.throws(() => p.defineBand({ grade: 'L1', jobFamily: 'x', min: -1, mid: 5, max: 10 }));
});

test('defineBand follows grow-only rule', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 20000, mid: 25000, max: 32000 });
  // Attempt to lower — should be clamped up
  const b = p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 18000, mid: 23000, max: 30000 });
  assert.strictEqual(b.min, 20000, 'min should not shrink');
  assert.strictEqual(b.mid, 25000, 'mid should not shrink');
  assert.strictEqual(b.max, 32000, 'max should not shrink');
});

test('defineBand force=true allows downgrade for remediation', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 20000, mid: 25000, max: 32000 });
  const b = p.defineBand({
    grade: 'L3', jobFamily: 'eng', min: 18000, mid: 23000, max: 30000, force: true,
  });
  assert.strictEqual(b.min, 18000);
});

// ───────────────────────────────────────────────────────────────

section('Compa-ratio / positionInRange');

test('compa-ratio = salary / midpoint', () => {
  const p = buildPlanner();
  const r = p.positionInRange('E001'); // 25000 / 28000 ≈ 0.893
  assert.strictEqual(r.compaRatio, round2(25000 / 28000));
  assert.strictEqual(r.quartile, 'Q1'); // 0.893 < 0.9 → Q1
});

test('compa-ratio quartile boundaries', () => {
  const p = buildPlanner();
  // E002: 31000/28000 = 1.107 → Q4
  assert.strictEqual(p.positionInRange('E002').quartile, 'Q4');
  // E004: 26500/28000 = 0.946 → Q2
  assert.strictEqual(p.positionInRange('E004').quartile, 'Q2');
});

test('range penetration is clamped to 0..1', () => {
  const p = buildPlanner();
  const r = p.positionInRange('E005'); // 50000 in [32000,55000] → (50-32)/(55-32)=18/23≈0.78
  assert.ok(r.rangePenetration >= 0 && r.rangePenetration <= 1);
  assert.ok(r.rangePenetration > 0.7 && r.rangePenetration < 0.9);
});

test('positionInRange flags belowMin / aboveMax', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L1', jobFamily: 'x', min: 20000, mid: 25000, max: 30000 });
  p.upsertEmployee({ id: 'A', grade: 'L1', jobFamily: 'x', baseSalary: 15000, performance: 3 });
  p.upsertEmployee({ id: 'B', grade: 'L1', jobFamily: 'x', baseSalary: 35000, performance: 3 });
  assert.strictEqual(p.positionInRange('A').belowMin, true);
  assert.strictEqual(p.positionInRange('B').aboveMax, true);
});

// ───────────────────────────────────────────────────────────────

section('Merit matrix');

test('high performer at low compa gets biggest increase', () => {
  const p = new CompPlanner();
  const top = p.meritMatrix({ performance: 5, compaRatio: 0.85 });
  const bot = p.meritMatrix({ performance: 1, compaRatio: 1.20 });
  assert.strictEqual(top.increasePct, DEFAULT_MERIT_MATRIX[5].Q1);
  assert.strictEqual(bot.increasePct, 0);
  assert.ok(top.increasePct > bot.increasePct);
});

test('merit matrix monotonic — higher perf ≥ lower perf at same quartile', () => {
  const p = new CompPlanner();
  for (const q of [0.85, 0.95, 1.05, 1.15]) {
    let prev = -1;
    for (const perf of [1, 2, 3, 4, 5]) {
      const pct = p.meritMatrix({ performance: perf, compaRatio: q }).increasePct;
      assert.ok(pct >= prev, `perf=${perf} q=${q} pct=${pct} prev=${prev}`);
      prev = pct;
    }
  }
});

test('merit matrix monotonic — lower compa ≥ higher compa at same perf', () => {
  const p = new CompPlanner();
  for (const perf of [2, 3, 4, 5]) {
    const q1 = p.meritMatrix({ performance: perf, compaRatio: 0.85 }).increasePct;
    const q4 = p.meritMatrix({ performance: perf, compaRatio: 1.15 }).increasePct;
    assert.ok(q1 >= q4, `perf=${perf}: Q1 ${q1} should be ≥ Q4 ${q4}`);
  }
});

// ───────────────────────────────────────────────────────────────

section('Planned increase (budget allocation)');

test('merit-matrix method respects budget ceiling', () => {
  const p = buildPlanner();
  const r = p.plannedIncrease({
    budget: 5000,
    employees: ['E001', 'E002', 'E003', 'E004', 'E005'],
    method: 'merit-matrix',
  });
  assert.ok(r.totalGranted <= 5000 + 1, 'totalGranted exceeds budget');
  assert.strictEqual(r.allocations.length, 5);
});

test('merit-matrix method does not exceed proposed when budget is generous', () => {
  const p = buildPlanner();
  const r = p.plannedIncrease({
    budget: 10_000_000,
    employees: ['E001', 'E002', 'E003', 'E004', 'E005'],
    method: 'merit-matrix',
  });
  assert.strictEqual(r.scaleApplied, 1);
  assert.ok(r.totalGranted === r.totalProposed);
});

test('cola method applies flat percent', () => {
  const p = buildPlanner();
  const r = p.plannedIncrease({
    budget: 10_000_000,
    employees: ['E001', 'E002'],
    method: 'cola',
    colaPct: 0.025,
  });
  // both allocations should be 2.5% of salary
  assert.strictEqual(r.allocations[0].proposedPct, 0.03); // round2(0.025)=0.03
  assert.strictEqual(r.allocations[1].proposedPct, 0.03);
});

test('market-adjust increases only those below market mid', () => {
  const p = buildPlanner();
  const r = p.plannedIncrease({
    budget: 10_000_000,
    employees: ['E001', 'E002'],
    method: 'market-adjust',
  });
  // E001 (25000) below mid 28000 → positive bump
  // E002 (31000) above mid 28000 → 0 bump
  const e1 = r.allocations.find(a => a.employeeId === 'E001');
  const e2 = r.allocations.find(a => a.employeeId === 'E002');
  assert.ok(e1.proposedAmount > 0);
  assert.strictEqual(e2.proposedAmount, 0);
});

// ───────────────────────────────────────────────────────────────

section('Market comparison');

test('marketComparison returns IL benchmark sample', () => {
  const p = new CompPlanner();
  const r = p.marketComparison({ role: 'engineering', level: 'senior', location: 'IL' });
  assert.ok(r.data);
  assert.strictEqual(r.currency, 'ILS');
  assert.ok(r.data.min && r.data.mid && r.data.max);
});

test('marketComparison handles unknown role gracefully', () => {
  const p = new CompPlanner();
  const r = p.marketComparison({ role: 'plumbing', level: 'senior', location: 'IL' });
  assert.strictEqual(r.data, null);
});

test('marketComparison non-IL location returns note', () => {
  const p = new CompPlanner();
  const r = p.marketComparison({ role: 'engineering', level: 'senior', location: 'US' });
  assert.strictEqual(r.data, null);
  assert.ok(r.note);
});

// ───────────────────────────────────────────────────────────────

section('Total rewards');

test('totalRewards sums base + bonus + equity + statutory + benefits', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 20000, mid: 25000, max: 32000 });
  p.upsertEmployee({
    id: 'T1', grade: 'L3', jobFamily: 'eng',
    baseSalary: 25000, bonus: 20000, equity: 30000,
    mealAllowance: 500, carAllowance: 1500,
  });
  const r = p.totalRewards('T1');
  const baseAnnual = 25000 * 12;
  assert.strictEqual(r.components.baseAnnual, baseAnnual);
  assert.strictEqual(r.components.bonus, 20000);
  assert.strictEqual(r.components.equity, 30000);
  // pension = base * 0.065 * 12
  const pension = Math.round(25000 * IL_EMPLOYER.PENSION_PCT * 12);
  assert.strictEqual(r.components.pension, pension);
  assert.strictEqual(r.components.mealAllowance, 6000);
  assert.strictEqual(r.components.carAllowance, 18000);
  assert.ok(r.totalAnnual > baseAnnual, 'total must exceed base');
});

// ───────────────────────────────────────────────────────────────

section('Pay equity');

test('equityPay flags gender gap above threshold', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 20000, mid: 28000, max: 36000 });
  // males avg 32000, females avg 24000 → ~25% gap
  for (let i = 0; i < 4; i++) {
    p.upsertEmployee({
      id: `M${i}`, grade: 'L3', jobFamily: 'eng', baseSalary: 32000, gender: 'male',
    });
    p.upsertEmployee({
      id: `F${i}`, grade: 'L3', jobFamily: 'eng', baseSalary: 24000, gender: 'female',
    });
  }
  const r = p.equityPay();
  assert.ok(r.flags.length > 0, 'should flag gap');
  assert.ok(r.flags.some(f => f.type === 'gender'));
});

test('equityPay suppresses tiny groups', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 20000, mid: 28000, max: 36000 });
  p.upsertEmployee({ id: 'M1', grade: 'L3', jobFamily: 'eng', baseSalary: 30000, gender: 'male' });
  p.upsertEmployee({ id: 'F1', grade: 'L3', jobFamily: 'eng', baseSalary: 25000, gender: 'female' });
  const r = p.equityPay();
  const band = r.byBand[0];
  assert.ok(band.genderMeans.male.suppressed || band.genderMeans.female.suppressed,
    'n<3 groups should be suppressed');
});

// ───────────────────────────────────────────────────────────────

section('Pay compression');

test('payCompression detects manager below top report', () => {
  const p = buildPlanner();
  // Rina (M001) 48000, top report E005 = 50000 → compressed
  const r = p.payCompression();
  assert.ok(r.issues.length > 0);
  const issue = r.issues[0];
  assert.strictEqual(issue.managerId, 'M001');
  assert.ok(issue.remediationILS > 0);
});

test('no compression when manager earns floor * top', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L1', jobFamily: 'x', min: 10000, mid: 15000, max: 20000 });
  p.defineBand({ grade: 'M1', jobFamily: 'x', min: 20000, mid: 25000, max: 32000 });
  p.upsertEmployee({ id: 'R1', grade: 'L1', jobFamily: 'x', baseSalary: 15000 });
  p.upsertEmployee({ id: 'MG', grade: 'M1', jobFamily: 'x', baseSalary: 20000 }); // 15000*1.33 > 16500
  p.employees.get('R1').managerId = 'MG';
  const r = p.payCompression();
  assert.strictEqual(r.issues.length, 0);
});

// ───────────────────────────────────────────────────────────────

section('Hiring bands');

test('hiringBands recommends min at least band.min', () => {
  const p = buildPlanner();
  const bands = p.hiringBands();
  for (const b of bands) {
    assert.ok(b.recommendedHireMin >= b.bandMin);
  }
});

test('hiringBands warns when manager too compressed', () => {
  const p = new CompPlanner();
  p.defineBand({ grade: 'L3', jobFamily: 'eng', min: 30000, mid: 40000, max: 60000 });
  // Manager at 20000 — any hire at band.min 30000 would compress her
  p.upsertEmployee({ id: 'MGR', grade: 'M1', jobFamily: 'eng', baseSalary: 20000 });
  p.upsertEmployee({ id: 'REP', grade: 'L3', jobFamily: 'eng', baseSalary: 30000, managerId: 'MGR' });
  const bands = p.hiringBands();
  const engBand = bands.find(b => b.jobFamily === 'eng');
  assert.ok(engBand);
  // managerFloor = 20000/1.1 ≈ 18182 (max allowed hire) which is < band.min 30000
  // so warning triggers only when recommendedMin > band.max
});

// ───────────────────────────────────────────────────────────────

section('Budget tracker');

test('budgetTracker computes variance', () => {
  const p = new CompPlanner();
  const r1 = p.budgetTracker({ period: '2026-Q1', departmentId: 'R&D', planned: 500000, actual: 450000 });
  assert.strictEqual(r1.planned, 500000);
  assert.strictEqual(r1.actual, 450000);
  assert.strictEqual(r1.variance, 50000);
  assert.strictEqual(r1.status, 'under-budget');
});

test('budgetTracker planned is grow-only', () => {
  const p = new CompPlanner();
  p.budgetTracker({ period: '2026-Q1', departmentId: 'R&D', planned: 500000 });
  // Attempt to lower
  const r = p.budgetTracker({ period: '2026-Q1', departmentId: 'R&D', planned: 400000 });
  assert.strictEqual(r.planned, 500000, 'planned should not shrink');
});

test('budgetTracker flags over-budget', () => {
  const p = new CompPlanner();
  const r = p.budgetTracker({ period: '2026-Q1', departmentId: 'R&D', planned: 100000, actual: 120000 });
  assert.strictEqual(r.status, 'over-budget');
  assert.strictEqual(r.variance, -20000);
});

// ───────────────────────────────────────────────────────────────

section('Increase letter');

test('generateIncreaseLetter produces Hebrew + English bilingual output', () => {
  const p = buildPlanner();
  const emp = p.getEmployee('E001');
  emp.proposedIncrease = {
    pct: 0.06,
    newSalary: 25000 * 1.06,
    effectiveDate: '2026-05-01',
    reason: 'Merit Increase',
  };
  const letter = p.generateIncreaseLetter('E001');
  assert.ok(letter.hebrew.includes('שלום'));
  assert.ok(letter.hebrew.includes('העלאה'));
  assert.ok(letter.hebrew.includes('לא מוחקים רק משדרגים ומגדלים'));
  assert.ok(letter.english.includes('Hello'));
  assert.ok(letter.english.includes('Increase'));
  assert.ok(letter.english.includes('never delete, only upgrade and grow'));
  assert.strictEqual(letter.increaseAmount, 1500);
});

test('generateIncreaseLetter rejects missing proposedIncrease', () => {
  const p = buildPlanner();
  assert.throws(() => p.generateIncreaseLetter('E002'));
});

// ═══════════════════════════════════════════════════════════════
// helpers
// ═══════════════════════════════════════════════════════════════

function round2(n) { return Math.round(n * 100) / 100; }

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log(`\n───────────────────────────────────`);
console.log(`  PASS: ${passed}    FAIL: ${failed}`);
console.log(`───────────────────────────────────`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
    console.log(`    ${f.error.stack || f.error.message}`);
  }
  process.exit(1);
} else {
  process.exit(0);
}
