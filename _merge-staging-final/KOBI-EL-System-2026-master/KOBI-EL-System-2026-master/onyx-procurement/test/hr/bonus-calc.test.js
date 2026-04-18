/**
 * Unit tests for BonusCalculator — Israeli Payroll-Aware Bonus Engine
 * Agent Y-072 — written 2026-04-11
 *
 * Run:   node --test test/hr/bonus-calc.test.js
 *
 * Covers:
 *   - performance multiplier (rating × achievement × base)
 *   - clawback linear pro-rata + ledger entry
 *   - holiday gift tax-free ceiling (with overflow)
 *   - 13th salary eligibility (covered vs. not covered)
 *   - Israeli tax treatment (marginal vs flat, social charges,
 *     holiday gift taxed only on overflow)
 *   - retention multi-tranche rounding
 *   - project distribution by weight (+ drift correction)
 *   - bilingual communication letter does not over-commit
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BonusCalculator,
  HOLIDAY_GIFT_TAX_FREE_CEILING_ILS,
  DEFAULT_PERFORMANCE_CURVE,
  SOCIAL_CHARGES,
} = require('../../src/hr/bonus-calc.js');

// ──────────────────────────────────────────────────────────────
// Shared fixtures
// ──────────────────────────────────────────────────────────────

function fixedEmployee(overrides = {}) {
  return {
    id: 'emp-001',
    name: 'אורי כהן',
    base_salary: 20000, // ILS / month
    hire_date: '2025-01-01',
    months_worked: 12,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// 1. PERFORMANCE BONUS
// ──────────────────────────────────────────────────────────────

test('01. performance bonus — rating 3 at 100% target pays exactly target', () => {
  const calc = new BonusCalculator();
  const r = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 3,
    targetPct: 10,
    actualPct: 10,
    period: { start: '2026-01-01', end: '2026-12-31' },
  });
  // 20000 × 10% × (10/10=1) × multiplier(3)=1.0  => 2000
  assert.equal(r.gross, 2000);
  assert.equal(r.multiplier, 1.0);
  assert.equal(r.achievement_rate, 1);
  assert.equal(r.type, 'performance');
  assert.equal(r.taxable, true);
  assert.equal(r.counts_as_salary, true);
});

test('02. performance bonus — rating 5 at 120% target scales by full curve', () => {
  const calc = new BonusCalculator();
  const r = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 5,
    targetPct: 10,
    actualPct: 12,
  });
  // 20000 × 10% × (12/10=1.2) × 1.5 => 3600
  assert.equal(r.gross, 3600);
  assert.equal(r.multiplier, DEFAULT_PERFORMANCE_CURVE[5]);
});

test('03. performance bonus — rating 1 forces zero gross', () => {
  const calc = new BonusCalculator();
  const r = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 1,
    targetPct: 10,
    actualPct: 10,
  });
  assert.equal(r.gross, 0);
  assert.equal(r.multiplier, 0);
});

test('04. performance bonus — achievement capped at 2x', () => {
  const calc = new BonusCalculator();
  const r = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 3,
    targetPct: 10,
    actualPct: 1000, // ridiculous overachievement
  });
  // achievement should be capped to 2; so gross = 20000 × 0.1 × 2 × 1 = 4000
  assert.equal(r.achievement_rate, 2);
  assert.equal(r.gross, 4000);
});

// ──────────────────────────────────────────────────────────────
// 2. RETENTION BONUS (multi-tranche)
// ──────────────────────────────────────────────────────────────

test('05. retention bonus — explicit payoutDates split total, last tranche absorbs drift', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateRetentionBonus({
    employee: fixedEmployee(),
    amount: 10000,
    vestingPeriod: 24,
    payoutDates: ['2026-06-30', '2027-06-30', '2028-06-30'], // 3 tranches
  });
  assert.equal(r.tranches.length, 3);
  const sum = r.tranches.reduce((s, t) => s + t.amount, 0);
  assert.equal(Math.round(sum * 100) / 100, 10000);
  // first two equal, last may differ by a cent max
  assert.ok(r.tranches[0].amount > 0);
  assert.equal(r.tranches[0].amount, r.tranches[1].amount);
});

test('06. retention bonus — auto-schedule when payoutDates omitted', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateRetentionBonus({
    employee: fixedEmployee(),
    amount: 12000,
    vestingPeriod: 12,
  });
  assert.ok(Array.isArray(r.tranches));
  assert.ok(r.tranches.length >= 1);
  const sum = r.tranches.reduce((s, t) => s + t.amount, 0);
  assert.equal(Math.round(sum * 100) / 100, 12000);
});

// ──────────────────────────────────────────────────────────────
// 3. SIGNING BONUS + CLAWBACK
// ──────────────────────────────────────────────────────────────

test('07. signing bonus — default clawback window stored', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 24000,
  });
  assert.equal(r.gross, 24000);
  assert.equal(r.clawback_period_months, 24);
  assert.equal(r.clawback_policy, 'linear_pro_rata');
});

test('08. clawback — linear pro-rata returns half the signing bonus at midpoint', () => {
  const calc = new BonusCalculator();
  const sign = calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 24000,
    clawbackPeriod: 24,
  });
  // Worked 12 out of 24 months → vested 50% → owed 50%
  const owed = calc.computeSigningClawback(sign, 12);
  assert.equal(owed, 12000);
});

test('09. clawback — leaves after 0 months, full amount owed', () => {
  const calc = new BonusCalculator();
  const sign = calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 24000,
    clawbackPeriod: 24,
  });
  assert.equal(calc.computeSigningClawback(sign, 0), 24000);
});

test('10. clawback — leaves after full window, nothing owed', () => {
  const calc = new BonusCalculator();
  const sign = calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 24000,
    clawbackPeriod: 24,
  });
  assert.equal(calc.computeSigningClawback(sign, 24), 0);
  assert.equal(calc.computeSigningClawback(sign, 999), 0);
});

test('11. clawback() creates a non-destructive ledger entry linked to original', () => {
  const calc = new BonusCalculator();
  const sign = calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 24000,
    clawbackPeriod: 24,
  });
  const owed = calc.computeSigningClawback(sign, 6);
  const claw = calc.clawback({
    employeeId: 'emp-001',
    reason: 'Voluntary resignation within 24 months',
    amount: owed,
    bonusId: sign.id,
  });
  assert.equal(claw.type, 'clawback');
  assert.equal(claw.amount, 18000); // 24000 * (1 - 6/24) = 18000
  const original = calc.getBonus(sign.id);
  // Original record still exists — לא מוחקים
  assert.ok(original);
  assert.equal(original.gross, 24000);
  assert.equal(Array.isArray(original.clawback_history), true);
  assert.equal(original.clawback_history.length, 1);
});

// ──────────────────────────────────────────────────────────────
// 4. HOLIDAY GIFT — Israeli tax-exempt ceiling
// ──────────────────────────────────────────────────────────────

test('12. holiday gift — exactly at ceiling is fully tax-free', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateHolidayBonus({
    employee: fixedEmployee(),
    period: 'rosh-hashana',
    amount: HOLIDAY_GIFT_TAX_FREE_CEILING_ILS,
  });
  assert.equal(r.tax_free_portion, HOLIDAY_GIFT_TAX_FREE_CEILING_ILS);
  assert.equal(r.taxable_portion, 0);
  assert.equal(r.taxable, false);
  assert.equal(r.counts_as_salary, false);
});

test('13. holiday gift — above ceiling produces taxable overflow', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateHolidayBonus({
    employee: fixedEmployee(),
    period: 'passover',
    amount: 500, // > 228
  });
  assert.equal(r.tax_free_portion, HOLIDAY_GIFT_TAX_FREE_CEILING_ILS);
  assert.equal(r.taxable_portion, 500 - HOLIDAY_GIFT_TAX_FREE_CEILING_ILS);
  assert.equal(r.taxable, true);
});

test('14. holiday gift — rejects unknown holiday key', () => {
  const calc = new BonusCalculator();
  assert.throws(
    () =>
      calc.calculateHolidayBonus({
        employee: fixedEmployee(),
        period: 'unknown-holiday',
        amount: 100,
      }),
    /Unknown holiday period/
  );
});

test('15. holiday gift — applyTax only taxes the overflow portion', () => {
  const calc = new BonusCalculator({ marginalRate: 0.5 }); // simple 50% for arithmetic
  const r = calc.calculateHolidayBonus({
    employee: fixedEmployee(),
    period: 'purim',
    amount: 528, // taxable = 300, tax-free = 228
  });
  const taxed = calc.applyTax({ bonus: r });
  assert.equal(taxed.tax, 150); // 300 × 50%
  // social charges skipped: counts_as_salary === false for holiday gift
  assert.equal(taxed.bituach_leumi, 0);
  assert.equal(taxed.pension_deduction, 0);
  assert.equal(taxed.health_tax, 0);
  // net = 528 - 150 - 0 - 0 - 0 = 378
  assert.equal(taxed.net, 378);
});

// ──────────────────────────────────────────────────────────────
// 5. 13TH MONTH
// ──────────────────────────────────────────────────────────────

test('16. 13th salary — eligible (collective agreement), full 12 months', () => {
  const calc = new BonusCalculator();
  const r = calc.calculate13thMonth({
    employee: fixedEmployee({ months_worked: 12 }),
    eligibility: { covered: true, source: 'הסכם קיבוצי ענפי' },
  });
  assert.equal(r.eligible, true);
  assert.equal(r.gross, 20000);
  assert.equal(r.eligibility_source, 'הסכם קיבוצי ענפי');
  assert.equal(r.counts_as_salary, true);
});

test('17. 13th salary — eligible but partial year, pro-rata', () => {
  const calc = new BonusCalculator();
  const r = calc.calculate13thMonth({
    employee: fixedEmployee({ months_worked: 6 }),
    eligibility: { covered: true },
  });
  assert.equal(r.gross, 10000);
});

test('18. 13th salary — NOT covered, zero gross and eligible:false', () => {
  const calc = new BonusCalculator();
  const r = calc.calculate13thMonth({
    employee: fixedEmployee(),
    eligibility: { covered: false },
  });
  assert.equal(r.eligible, false);
  assert.equal(r.gross, 0);
});

// ──────────────────────────────────────────────────────────────
// 6. PROJECT BONUS
// ──────────────────────────────────────────────────────────────

test('19. project bonus — distributes by weight and absorbs drift on last member', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateProjectBonus({
    project: { id: 'p-1', name: 'Onyx Bridge', status: 'completed' },
    team: [
      { employee_id: 'a', weight: 1 },
      { employee_id: 'b', weight: 1 },
      { employee_id: 'c', weight: 1 },
    ],
    budget: 10000, // 3333.33 × 2 + 3333.34
  });
  const sum = r.distribution.reduce((s, d) => s + d.gross, 0);
  assert.equal(Math.round(sum * 100) / 100, 10000);
  assert.equal(r.distribution.length, 3);
});

// ──────────────────────────────────────────────────────────────
// 7. TAX TREATMENT
// ──────────────────────────────────────────────────────────────

test('20. applyTax — marginal mode deducts tax + BL + pension + health', () => {
  const calc = new BonusCalculator({ marginalRate: 0.5 });
  const perf = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 3,
    targetPct: 10,
    actualPct: 10,
  });
  // gross = 2000
  const taxed = calc.applyTax({ bonus: perf, taxRate: 'marginal' });
  assert.equal(taxed.tax, 1000); // 2000 * 0.5
  assert.equal(taxed.bituach_leumi, 2000 * SOCIAL_CHARGES.BITUACH_LEUMI_EMPLOYEE);
  assert.equal(taxed.pension_deduction, 2000 * SOCIAL_CHARGES.PENSION_EMPLOYEE);
  assert.equal(taxed.health_tax, 2000 * SOCIAL_CHARGES.HEALTH_TAX);
  const expectedNet =
    2000 -
    1000 -
    2000 * SOCIAL_CHARGES.BITUACH_LEUMI_EMPLOYEE -
    2000 * SOCIAL_CHARGES.PENSION_EMPLOYEE -
    2000 * SOCIAL_CHARGES.HEALTH_TAX;
  assert.equal(taxed.net, Math.round(expectedNet * 100) / 100);
});

test('21. applyTax — flat mode uses configured flat rate', () => {
  const calc = new BonusCalculator({ flatRate: 0.35 });
  const perf = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 3,
    targetPct: 10,
    actualPct: 10,
  });
  const taxed = calc.applyTax({ bonus: perf, taxRate: 'flat' });
  assert.equal(taxed.tax_mode, 'flat');
  assert.equal(taxed.tax, 700); // 2000 × 0.35
});

// ──────────────────────────────────────────────────────────────
// 8. PAYOUT SCHEDULE & COMMUNICATION
// ──────────────────────────────────────────────────────────────

test('22. payoutSchedule — retention returns tranche list', () => {
  const calc = new BonusCalculator();
  const r = calc.calculateRetentionBonus({
    employee: fixedEmployee(),
    amount: 9000,
    vestingPeriod: 12,
    payoutDates: ['2026-06-30', '2027-06-30', '2028-06-30'],
  });
  const sched = calc.payoutSchedule(r.id);
  assert.equal(sched.schedule.length, 3);
  assert.equal(sched.schedule[0].status, 'pending');
});

test('23. payoutSchedule — unknown bonus id returns empty schedule', () => {
  const calc = new BonusCalculator();
  const sched = calc.payoutSchedule('does-not-exist');
  assert.equal(sched.found, false);
  assert.equal(sched.schedule.length, 0);
});

test('24. communicateBonus — produces bilingual, non-empty letter and does not over-commit', () => {
  const calc = new BonusCalculator();
  calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 4,
    targetPct: 10,
    actualPct: 10,
  });
  calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 12000,
  });
  const letter = calc.communicateBonus('emp-001');
  assert.ok(letter.he.length > 0);
  assert.ok(letter.en.length > 0);
  // The required disclaimers must be present in both languages
  assert.match(letter.he, /אומדני|בכפוף/);
  assert.match(letter.en, /estimate|final figure/i);
  // No over-promises — no phrases like "guaranteed" / "מובטח"
  assert.doesNotMatch(letter.he, /מובטח/);
  assert.doesNotMatch(letter.en, /guaranteed/i);
  // Clawback disclosure for signing bonus
  assert.match(letter.he, /pro-rata|יחסי/);
  assert.match(letter.en, /clawback|pro-rata/i);
});

test('25. ledger preserves history — לא מוחקים רק משדרגים ומגדלים', () => {
  const calc = new BonusCalculator();
  const p = calc.calculatePerformanceBonus({
    employee: fixedEmployee(),
    rating: 3,
    targetPct: 10,
    actualPct: 10,
  });
  const s = calc.calculateSigningBonus({
    employee: fixedEmployee(),
    amount: 10000,
  });
  const taxed = calc.applyTax({ bonus: p }); // upgrading, not deleting
  assert.equal(calc.getLedger().length, 2);
  // Original record id is still present after upgrading
  assert.ok(calc.getBonus(p.id));
  assert.ok(calc.getBonus(s.id));
  // Tax fields were added, original fields preserved
  assert.equal(taxed.gross, p.gross);
  assert.ok(taxed.net != null);
});
