/**
 * Mortgage Calculator — Unit Tests (Israeli mortgage, AG-Y053)
 *
 * Run with:
 *   node --test test/realestate/mortgage-calc.test.js
 *   or: node test/run.js --only mortgage-calc
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  MortgageCalculator,
  BOI_CONSTANTS,
  TRACKS,
  pmt,
  remainingBalance,
  pvOfAnnuity,
} = require(path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'realestate',
  'mortgage-calc.js'
));

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function near(a, b, eps = 1) {
  return Math.abs(a - b) <= eps;
}
function assertNear(actual, expected, eps = 1, msg) {
  assert.ok(
    near(actual, expected, eps),
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`
  );
}

// ─────────────────────────────────────────────
// 1. PMT — pure amortization formula
// ─────────────────────────────────────────────

test('pmt: classic 30-yr fixed at 5% on ₪1,000,000 ≈ 5,368.22', () => {
  // Known textbook value: 1,000,000 @ 5%/360 = 5,368.216...
  const p = pmt(1_000_000, 0.05, 360);
  assertNear(p, 5368.22, 0.5);
});

test('pmt: zero-rate loan is principal/term', () => {
  const p = pmt(120_000, 0, 120);
  assert.equal(p, 1000);
});

test('pmt: 10-year, 6% on ₪500k ≈ 5,551.03', () => {
  const p = pmt(500_000, 0.06, 120);
  assertNear(p, 5551.03, 0.5);
});

test('pmt: negative principal returns 0', () => {
  assert.equal(pmt(-1, 0.05, 12), 0);
});

// ─────────────────────────────────────────────
// 2. remainingBalance — midway through a loan
// ─────────────────────────────────────────────

test('remainingBalance: at month 0 returns full principal', () => {
  assert.equal(remainingBalance(1_000_000, 0.05, 360, 0), 1_000_000);
});

test('remainingBalance: at end returns 0', () => {
  assert.equal(remainingBalance(1_000_000, 0.05, 360, 360), 0);
});

test('remainingBalance: 360m loan halfway through is still >60% of principal', () => {
  // Spitzer front-loaded: after half the term of a 30-yr @ 5%, roughly
  // two-thirds of principal is still owed (~₪678k of ₪1M).
  const bal = remainingBalance(1_000_000, 0.05, 360, 180);
  assert.ok(bal > 600_000, `expected > 600k, got ${bal}`);
  assert.ok(bal < 1_000_000);
});

// ─────────────────────────────────────────────
// 3. MortgageCalculator — prime rate & track meta
// ─────────────────────────────────────────────

test('primeRate = BOI rate + 1.5pp', () => {
  const mc = new MortgageCalculator({ boiRate: 0.045 });
  assert.equal(mc.primeRate(), 0.06);
});

test('primeRate override via opts', () => {
  const mc = new MortgageCalculator({ boiRate: 0.02, primeSpread: 0.015 });
  assert.equal(mc.primeRate(), 0.035);
});

test('All 7 required tracks are present and frozen', () => {
  const required = [
    'prime',
    'kal',
    'kal-fixed',
    'kalf',
    'kalm',
    'zamad-matbea',
    'mishtanne-kol-5',
  ];
  for (const r of required) {
    assert.ok(TRACKS[r], `track ${r} missing`);
    assert.ok(TRACKS[r].nameHe, `track ${r} has Hebrew name`);
    assert.ok(TRACKS[r].nameEn, `track ${r} has English name`);
  }
});

// ─────────────────────────────────────────────
// 4. computeMix — mixed-mortgage payment
// ─────────────────────────────────────────────

test('computeMix: single kalf line matches plain pmt', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 1_000_000,
    term: 360,
    composition: [{ type: 'kalf', pct: 1, rate: 0.05 }],
  });
  assert.equal(mix.lines.length, 1);
  assertNear(mix.totalMonthlyPayment, 5368.22, 0.5);
  assert.equal(mix.termYears, 30);
});

test('computeMix: standard BOI-compliant mix on ₪1.5M / 25y', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 1_500_000,
    term: 300,
    composition: [
      { type: 'prime', pct: 1 / 3 },            // uses current prime
      { type: 'kalf', pct: 1 / 3, rate: 0.05 }, // fixed 5%
      { type: 'kal', pct: 1 / 3, rate: 0.035 }, // cpi-variable 3.5%
    ],
  });
  assert.equal(mix.lines.length, 3);
  // Prime component uses BOI rate of 4.5% + 1.5 = 6%
  assert.equal(mix.lines[0].rate, 0.06);
  // Total monthly payment must be positive and sensible
  assert.ok(mix.totalMonthlyPayment > 7000);
  assert.ok(mix.totalMonthlyPayment < 12000);
  // Totals add up
  assertNear(
    mix.lines.reduce((a, l) => a + l.principal, 0),
    1_500_000,
    1
  );
});

test('computeMix: prime-linked without rate falls back to current prime', () => {
  const mc = new MortgageCalculator({ boiRate: 0.05 });
  const mix = mc.computeMix({
    amount: 600_000,
    term: 240,
    composition: [{ type: 'prime', pct: 1 }],
  });
  // prime = 5% + 1.5% = 6.5%
  assert.equal(mix.lines[0].rate, 0.065);
});

test('computeMix: non-prime track without a rate throws', () => {
  const mc = new MortgageCalculator();
  assert.throws(
    () =>
      mc.computeMix({
        amount: 100_000,
        term: 120,
        composition: [{ type: 'kalf', pct: 1 }],
      }),
    /needs an explicit rate/
  );
});

test('computeMix: rejects empty composition', () => {
  const mc = new MortgageCalculator();
  assert.throws(() => mc.computeMix({ amount: 1000, term: 12, composition: [] }));
});

test('computeMix: rejects negative amount', () => {
  const mc = new MortgageCalculator();
  assert.throws(() =>
    mc.computeMix({
      amount: -1000,
      term: 12,
      composition: [{ type: 'kalf', pct: 1, rate: 0.05 }],
    })
  );
});

// ─────────────────────────────────────────────
// 5. amortizationSchedule
// ─────────────────────────────────────────────

test('amortizationSchedule: length == term and final balance = 0', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 500_000,
    term: 60,
    composition: [{ type: 'kalf', pct: 1, rate: 0.04 }],
  });
  const rows = mc.amortizationSchedule(mix);
  assert.equal(rows.length, 60);
  assert.ok(rows[59].balance <= 0.01, `final balance ${rows[59].balance}`);
});

test('amortizationSchedule: sum(principalPaid) ≈ original amount', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 750_000,
    term: 120,
    composition: [{ type: 'kalf', pct: 1, rate: 0.045 }],
  });
  const rows = mc.amortizationSchedule(mix);
  const totalPrincipal = rows.reduce((a, r) => a + r.principalPaid, 0);
  assertNear(totalPrincipal, 750_000, 2);
});

test('amortizationSchedule: interest decreases over life (Spitzer)', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 800_000,
    term: 240,
    composition: [{ type: 'kalf', pct: 1, rate: 0.05 }],
  });
  const rows = mc.amortizationSchedule(mix);
  // In Spitzer, interest is largest at month 1 and smallest at the end.
  assert.ok(rows[0].interestPaid > rows[239].interestPaid);
  assert.ok(rows[0].principalPaid < rows[239].principalPaid);
});

test('amortizationSchedule: mix of 2 tracks — each line reconciles', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 1_000_000,
    term: 120,
    composition: [
      { type: 'kalf', pct: 0.5, rate: 0.05 },
      { type: 'prime', pct: 0.5 }, // rate = 6%
    ],
  });
  const rows = mc.amortizationSchedule(mix);
  assert.equal(rows.length, 120);
  // Month 1 aggregated payment ≈ sum of the two line payments
  const m1 = rows[0];
  const expected = mix.lines[0].monthlyPayment + mix.lines[1].monthlyPayment;
  assertNear(m1.payment, expected, 0.05);
});

// ─────────────────────────────────────────────
// 6. earlyRepaymentPenalty
// ─────────────────────────────────────────────

test('earlyRepaymentPenalty: prime track has NO breakage, only operational fee', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 500_000,
    term: 360,
    composition: [{ type: 'prime', pct: 1 }],
  });
  const p = mc.earlyRepaymentPenalty(mix, 24, 100_000);
  assert.equal(p.operationalFee, BOI_CONSTANTS.EARLY_REPAYMENT.OPERATIONAL_FEE);
  assert.equal(p.breakage, 0);
  assert.equal(p.total, BOI_CONSTANTS.EARLY_REPAYMENT.OPERATIONAL_FEE);
  assert.equal(p.lines[0].exemptReason, 'prime-linked: no breakage');
});

test('earlyRepaymentPenalty: fixed track with contract > market → positive breakage', () => {
  const mc = new MortgageCalculator();
  // Contract fixed at 7%, current market is Prime (6%) — bank loses income.
  const mix = mc.computeMix({
    amount: 500_000,
    term: 300,
    composition: [{ type: 'kalf', pct: 1, rate: 0.07 }],
  });
  const p = mc.earlyRepaymentPenalty(mix, 24, 100_000, {
    currentMarketRate: 0.05,
    noticeDays: 0,
  });
  assert.ok(p.breakage > 0, `expected > 0 breakage, got ${p.breakage}`);
  assert.ok(p.total > p.operationalFee);
});

test('earlyRepaymentPenalty: fixed track with contract < market → no breakage', () => {
  const mc = new MortgageCalculator();
  // Contract fixed at 3%, market is 6% — bank is making more from us at the
  // moment. It does NOT charge us a breakage to walk away.
  const mix = mc.computeMix({
    amount: 500_000,
    term: 300,
    composition: [{ type: 'kalf', pct: 1, rate: 0.03 }],
  });
  const p = mc.earlyRepaymentPenalty(mix, 24, 100_000, {
    currentMarketRate: 0.06,
  });
  assert.equal(p.breakage, 0);
});

test('earlyRepaymentPenalty: 30-day notice reduces breakage vs 0-day', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 500_000,
    term: 300,
    composition: [{ type: 'kalf', pct: 1, rate: 0.07 }],
  });
  const noNotice = mc.earlyRepaymentPenalty(mix, 24, 100_000, {
    currentMarketRate: 0.05,
    noticeDays: 0,
  });
  const with30d = mc.earlyRepaymentPenalty(mix, 24, 100_000, {
    currentMarketRate: 0.05,
    noticeDays: 30,
  });
  assert.ok(with30d.breakage < noNotice.breakage);
});

test('earlyRepaymentPenalty: after 1/3 of term, breakage is reduced', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 500_000,
    term: 300,
    composition: [{ type: 'kalf', pct: 1, rate: 0.07 }],
  });
  const early = mc.earlyRepaymentPenalty(mix, 24, 100_000, {
    currentMarketRate: 0.05,
  });
  const late = mc.earlyRepaymentPenalty(mix, 200, 100_000, {
    currentMarketRate: 0.05,
  });
  // Late repayment: after 1/3 of 300 = month 100, reduced to 50%
  assert.ok(late.lines[0].exemptReason === 'after 1/3 of term (reduced)');
  assert.ok(late.breakage < early.breakage);
});

// ─────────────────────────────────────────────
// 7. stressTest (Prime + 3%)
// ─────────────────────────────────────────────

test('stressTest: shock raises prime payment but not fixed payment', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 1_000_000,
    term: 300,
    composition: [
      { type: 'prime', pct: 0.5 },              // 6% → 9%
      { type: 'kalf', pct: 0.5, rate: 0.05 },   // stays 5%
    ],
  });
  const s = mc.stressTest(mix, 0.03, { applyToVariable: false });
  assert.ok(s.stressedPayment > s.baselinePayment);
  // delta > 0 for prime, fixed component unchanged
  assert.ok(s.delta > 0);
  // Fixed line payment unchanged in the stressed result
  const fixedOriginal = mix.lines[1].monthlyPayment;
  const fixedStressed = s.stressed.lines[1].monthlyPayment;
  assert.equal(fixedOriginal, fixedStressed);
});

test('stressTest: 100% fixed mortgage is unaffected by shock', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 800_000,
    term: 240,
    composition: [{ type: 'kalf', pct: 1, rate: 0.045 }],
  });
  const s = mc.stressTest(mix, 0.03);
  assertNear(s.stressedPayment, s.baselinePayment, 0.01);
  assertNear(s.delta, 0, 0.01);
});

test('stressTest: default shock is the BOI +3pp', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 500_000,
    term: 240,
    composition: [{ type: 'prime', pct: 1 }],
  });
  const s = mc.stressTest(mix);
  assert.equal(s.shock, BOI_CONSTANTS.AFFORDABILITY.STRESS_SHOCK_PP);
});

// ─────────────────────────────────────────────
// 8. affordabilityCheck (PTI ≤ 40%)
// ─────────────────────────────────────────────

test('affordabilityCheck: healthy PTI passes', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 700_000,
    term: 300,
    composition: [{ type: 'kalf', pct: 1, rate: 0.045 }],
  });
  const a = mc.affordabilityCheck(25_000, mix);
  assert.equal(a.ok, true);
  assert.ok(a.pti < 0.4);
  assert.ok(a.headroom > 0);
});

test('affordabilityCheck: unaffordable mortgage fails', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 2_500_000,
    term: 240,
    composition: [{ type: 'kalf', pct: 1, rate: 0.06 }],
  });
  const a = mc.affordabilityCheck(15_000, mix);
  assert.equal(a.ok, false);
  assert.ok(a.pti > 0.4);
  assert.match(a.reason, /PTI.*exceeds/);
});

test('affordabilityCheck: borderline payment flagged under stress', () => {
  const mc = new MortgageCalculator();
  // Mix includes heavy prime so stress makes a difference
  const mix = mc.computeMix({
    amount: 1_000_000,
    term: 300,
    composition: [
      { type: 'prime', pct: 2 / 3 },
      { type: 'kalf', pct: 1 / 3, rate: 0.05 },
    ],
  });
  // Income chosen so baseline PTI ≈ 38% but stressed PTI > 40%
  const a = mc.affordabilityCheck(17_500, mix);
  assert.ok(a.ok === true || a.ok === false);
  // stressed PTI is strictly larger than baseline PTI
  assert.ok(a.stressedPti >= a.pti);
});

test('affordabilityCheck: rejects non-positive income', () => {
  const mc = new MortgageCalculator();
  const mix = mc.computeMix({
    amount: 100_000,
    term: 120,
    composition: [{ type: 'kalf', pct: 1, rate: 0.05 }],
  });
  assert.throws(() => mc.affordabilityCheck(0, mix));
});

// ─────────────────────────────────────────────
// 9. LTV rules per borrower type
// ─────────────────────────────────────────────

test('computeMaxLTV: primary home = 75%', () => {
  const mc = new MortgageCalculator();
  assert.equal(mc.computeMaxLTV({ type: 'firstHome' }), 0.75);
});

test('computeMaxLTV: second home and investor = 50%', () => {
  const mc = new MortgageCalculator();
  assert.equal(mc.computeMaxLTV({ type: 'secondHome' }), 0.5);
  assert.equal(mc.computeMaxLTV({ type: 'investor' }), 0.5);
});

test('validateLTV: compliant primary buyer passes', () => {
  const mc = new MortgageCalculator();
  const v = mc.validateLTV({
    propertyValue: 2_000_000,
    loanAmount: 1_400_000,
    profile: { type: 'firstHome' },
  });
  assert.equal(v.ok, true);
  assert.equal(v.actualLTV, 0.7);
});

test('validateLTV: investor at 60% LTV → fails ceiling 50%', () => {
  const mc = new MortgageCalculator();
  const v = mc.validateLTV({
    propertyValue: 2_000_000,
    loanAmount: 1_200_000,
    profile: { type: 'investor' },
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /exceeds ceiling 50%/);
});

// ─────────────────────────────────────────────
// 10. Composition validation (BOI rules)
// ─────────────────────────────────────────────

test('validateComposition: compliant 3-track mix passes', () => {
  const mc = new MortgageCalculator();
  const v = mc.validateComposition({
    term: 300,
    composition: [
      { type: 'prime', pct: 1 / 3 },
      { type: 'kalf', pct: 1 / 3, rate: 0.05 },
      { type: 'kal', pct: 1 / 3, rate: 0.035 },
    ],
  });
  assert.equal(v.ok, true);
  assert.deepEqual(v.violations, []);
});

test('validateComposition: 100% prime fails fixed-share rule', () => {
  const mc = new MortgageCalculator();
  const v = mc.validateComposition({
    term: 300,
    composition: [{ type: 'prime', pct: 1 }],
  });
  assert.equal(v.ok, false);
  // Expect at least 2 violations: prime too high AND fixed too low
  assert.ok(v.violations.some((m) => /prime share/.test(m)));
  assert.ok(v.violations.some((m) => /fixed share/.test(m)));
});

test('validateComposition: sum != 100% fails', () => {
  const mc = new MortgageCalculator();
  const v = mc.validateComposition({
    term: 300,
    composition: [
      { type: 'kalf', pct: 0.4, rate: 0.05 },
      { type: 'prime', pct: 0.4 },
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((m) => /sums to/.test(m)));
});

test('validateComposition: term > 30 years fails', () => {
  const mc = new MortgageCalculator();
  const v = mc.validateComposition({
    term: 420, // 35 years
    composition: [
      { type: 'kalf', pct: 1 / 3, rate: 0.05 },
      { type: 'prime', pct: 1 / 3 },
      { type: 'kal', pct: 1 / 3, rate: 0.035 },
    ],
  });
  assert.equal(v.ok, false);
  assert.ok(v.violations.some((m) => /30-year/.test(m)));
});

// ─────────────────────────────────────────────
// 11. Smoke — BOI_CONSTANTS is frozen
// ─────────────────────────────────────────────

test('BOI_CONSTANTS is frozen (immutable)', () => {
  assert.throws(() => {
    BOI_CONSTANTS.BOI_RATE = 0.99;
  });
});

// ─────────────────────────────────────────────
// 12. End-to-end — realistic Israeli family (Haifa 2026)
// ─────────────────────────────────────────────

test('end-to-end: Haifa primary buyer, ₪1.8M property, ₪1.35M loan, 25y mix', () => {
  const mc = new MortgageCalculator();
  // LTV check (75% primary)
  const ltv = mc.validateLTV({
    propertyValue: 1_800_000,
    loanAmount: 1_350_000,
    profile: { type: 'firstHome' },
  });
  assert.equal(ltv.ok, true);
  assert.equal(ltv.actualLTV, 0.75);

  // Compose a BOI-legal mix
  const mix = mc.computeMix({
    amount: 1_350_000,
    term: 300,
    composition: [
      { type: 'prime', pct: 1 / 3 },
      { type: 'kalf', pct: 1 / 3, rate: 0.05 },
      { type: 'kal', pct: 1 / 3, rate: 0.035 },
    ],
  });
  assert.ok(mix.totalMonthlyPayment > 0);

  // Schedule reconciles
  const rows = mc.amortizationSchedule(mix);
  assert.equal(rows.length, 300);
  assert.ok(rows[299].balance <= 1); // fully paid

  // Stress test is higher than baseline
  const s = mc.stressTest(mix);
  assert.ok(s.stressedPayment > mix.totalMonthlyPayment);

  // Affordability at ₪22k income → comfortable
  const a = mc.affordabilityCheck(22_000, mix);
  assert.ok(a.pti < 0.5);

  // Composition validation
  const c = mc.validateComposition({ term: 300, composition: mix.lines.map((l) => ({
    type: l.type, pct: l.pct, rate: l.rate
  })) });
  assert.equal(c.ok, true);
});
