/**
 * roi-calculator.test.js — tests for the real-estate ROI kernel
 * Agent Y-060 / Swarm Real-Estate / Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Run with:    node --test test/realestate/roi-calculator.test.js
 *     or:      node test/run.js
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROI = require(
  path.resolve(__dirname, '..', '..', 'src', 'realestate', 'roi-calculator.js')
);

const {
  capRate,
  cashOnCash,
  grossYield,
  netYield,
  npv,
  irr,
  dscr,
  ltv,
  breakEvenOccupancy,
  holdingPeriodAnalysis,
  sensitivity,
  israeliAfterTaxReturn,
  ISRAELI_RENTAL_FLAT_RATE,
  ISRAELI_RENTAL_EXEMPT_CEILING_2026,
  ISRAELI_BETTERMENT_INDIV_RATE,
  LAW_CITATIONS,
} = ROI;

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

function near(a, b, eps = 1e-4) {
  return Math.abs(a - b) <= eps;
}
function assertNear(actual, expected, eps = 1e-4, msg) {
  assert.ok(
    near(actual, expected, eps),
    msg || `expected ${expected} ± ${eps}, got ${actual} (delta ${actual - expected})`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  1. Cap rate / שיעור היוון
// ═══════════════════════════════════════════════════════════════════════════

test('capRate — simple ratio', () => {
  assert.equal(capRate(120_000, 2_500_000), 0.048);
});

test('capRate — high-yield example', () => {
  assertNear(capRate(50_000, 500_000), 0.10);
});

test('capRate — throws on zero property value', () => {
  assert.throws(() => capRate(100_000, 0), /propertyValue must be > 0/);
});

test('capRate — throws on non-number input', () => {
  assert.throws(() => capRate('foo', 1_000_000), /finite number/);
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. Cash-on-cash / תשואה על ההון העצמי
// ═══════════════════════════════════════════════════════════════════════════

test('cashOnCash — 8% return', () => {
  const coc = cashOnCash({ annualCashFlow: 40_000, totalCashInvested: 500_000 });
  assertNear(coc, 0.08);
});

test('cashOnCash — leveraged scenario', () => {
  // ₪2.5M apt, 25% down = ₪625K, NOI ₪120K − debt service ₪70K = ₪50K
  const coc = cashOnCash({ annualCashFlow: 50_000, totalCashInvested: 625_000 });
  assertNear(coc, 0.08);
});

test('cashOnCash — throws on zero investment', () => {
  assert.throws(
    () => cashOnCash({ annualCashFlow: 10_000, totalCashInvested: 0 }),
    /totalCashInvested must be > 0/
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  3. Gross & Net yield
// ═══════════════════════════════════════════════════════════════════════════

test('grossYield — TLV-level 3%', () => {
  const y = grossYield({ annualRent: 60_000, price: 2_000_000 });
  assertNear(y, 0.03);
});

test('netYield — after opex', () => {
  const y = netYield({ annualRent: 60_000, opex: 12_000, price: 2_000_000 });
  assertNear(y, 0.024);
});

test('netYield — negative when opex > rent', () => {
  const y = netYield({ annualRent: 10_000, opex: 20_000, price: 1_000_000 });
  assertNear(y, -0.01);
});

// ═══════════════════════════════════════════════════════════════════════════
//  4. NPV
// ═══════════════════════════════════════════════════════════════════════════

test('npv — zero discount rate equals sum', () => {
  assert.equal(npv([-100, 50, 50, 50], 0), 50);
});

test('npv — classic textbook example (r=10%)', () => {
  // CF = [-1000, 200, 400, 600, 200] at t = 0..4, r = 10%
  //   = -1000 + 200/1.1 + 400/1.21 + 600/1.331 + 200/1.4641
  //   ≈ 99.788266
  const v = npv([-1000, 200, 400, 600, 200], 0.10);
  assertNear(v, 99.788266, 0.01);
});

test('npv — throws on empty array', () => {
  assert.throws(() => npv([], 0.05), /non-empty/);
});

test('npv — throws on discount rate <= -1', () => {
  assert.throws(() => npv([1, 2], -1), /discountRate must be > -1/);
});

// ═══════════════════════════════════════════════════════════════════════════
//  5. IRR — convergence suite
// ═══════════════════════════════════════════════════════════════════════════

test('irr — simple 10% return (vanilla)', () => {
  // Invest 1000, get 1100 back in 1 year => IRR = 10%
  const r = irr([-1000, 1100]);
  assertNear(r, 0.10, 1e-5);
});

test('irr — 5-year level cashflow', () => {
  // Invest 1000, receive 250/year for 5 years
  // IRR ≈ 7.9308%
  const r = irr([-1000, 250, 250, 250, 250, 250]);
  assertNear(r, 0.07930832, 1e-4);
});

test('irr — converges to NPV zero', () => {
  const cf = [-2_000_000, 150_000, 160_000, 170_000, 180_000, 2_600_000];
  const r = irr(cf);
  // Check NPV at computed IRR is near zero (the real test of convergence)
  const zero = npv(cf, r);
  assertNear(zero, 0, 0.5);
});

test('irr — multiple sign changes still finds a root', () => {
  // J-curve: outflow, inflow, outflow for capex, then large terminal
  const cf = [-1000, 500, -300, 800, 1200];
  const r = irr(cf);
  assert.ok(Number.isFinite(r), `irr should converge, got ${r}`);
  assertNear(npv(cf, r), 0, 0.5);
});

test('irr — all positive cashflows returns NaN', () => {
  const r = irr([100, 200, 300]);
  assert.ok(Number.isNaN(r));
});

test('irr — all negative cashflows returns NaN', () => {
  const r = irr([-100, -200, -300]);
  assert.ok(Number.isNaN(r));
});

test('irr — deep loss scenario (negative IRR)', () => {
  // Invest 1000, only recoup 500 over 3 years
  const cf = [-1000, 200, 200, 100];
  const r = irr(cf);
  assert.ok(r < 0, `expected negative IRR, got ${r}`);
  assertNear(npv(cf, r), 0, 0.5);
});

// ═══════════════════════════════════════════════════════════════════════════
//  6. DSCR / יחס כיסוי חוב
// ═══════════════════════════════════════════════════════════════════════════

test('dscr — healthy 1.25x', () => {
  const d = dscr({ noi: 125_000, annualDebtService: 100_000 });
  assert.equal(d, 1.25);
});

test('dscr — distressed < 1.0', () => {
  const d = dscr({ noi: 80_000, annualDebtService: 100_000 });
  assert.equal(d, 0.8);
});

test('dscr — throws on zero debt service', () => {
  assert.throws(
    () => dscr({ noi: 100_000, annualDebtService: 0 }),
    /annualDebtService must be > 0/
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  7. LTV
// ═══════════════════════════════════════════════════════════════════════════

test('ltv — 65%', () => {
  assert.equal(ltv({ loan: 1_300_000, value: 2_000_000 }), 0.65);
});

test('ltv — Israeli investor cap (50%)', () => {
  const l = ltv({ loan: 1_000_000, value: 2_000_000 });
  assert.equal(l, 0.5);
});

// ═══════════════════════════════════════════════════════════════════════════
//  8. Break-even occupancy
// ═══════════════════════════════════════════════════════════════════════════

test('breakEvenOccupancy — typical 10-unit rental', () => {
  // FC 100K, 10 units × (rent 20K − var 5K) = 150K → BE = 100/150 = 0.667
  const be = breakEvenOccupancy({
    fixedCosts: 100_000,
    varCostsPerOcc: 5_000,
    rentPerUnit: 20_000,
    units: 10,
  });
  assertNear(be, 0.6667, 1e-3);
});

test('breakEvenOccupancy — infinite when var > rent', () => {
  const be = breakEvenOccupancy({
    fixedCosts: 50_000,
    varCostsPerOcc: 15_000,
    rentPerUnit: 10_000,
    units: 5,
  });
  assert.equal(be, Infinity);
});

// ═══════════════════════════════════════════════════════════════════════════
//  9. Holding-period DCF
// ═══════════════════════════════════════════════════════════════════════════

test('holdingPeriodAnalysis — 5-year hold all-cash', () => {
  const out = holdingPeriodAnalysis({
    purchase: 2_000_000,
    equity: 2_000_000,
    closingCosts: 40_000,
    annualRent: 100_000,
    year1Opex: 20_000,
    rentGrowth: 0.03,
    expenseGrowth: 0.02,
    appreciation: 0.04,
    saleCosts: 0.05,
    holdYears: 5,
    discountRate: 0.06,
  });
  // Cashflow shape
  assert.equal(out.cashflows.length, 6);
  assert.equal(out.cashflows[0], -(2_000_000 + 40_000));
  // Year-1 NOI is 80K
  assertNear(out.noiByYear[0], 80_000, 0.5);
  // Year-5 sale price = 2M × 1.04^5 ≈ 2_433_306
  assertNear(out.salePrice, 2_433_305.86, 1.0);
  // IRR should be positive and finite
  assert.ok(Number.isFinite(out.irr));
  assert.ok(out.irr > 0);
  // NPV at 6% should be negative-ish because rent yield < discount rate
  // (we only assert existence + finiteness here, number is sensitive)
  assert.ok(Number.isFinite(out.npv));
  // Equity multiple = total inflow / total outflow
  assert.ok(out.equityMultiple > 0);
});

test('holdingPeriodAnalysis — leveraged case', () => {
  const out = holdingPeriodAnalysis({
    purchase: 2_000_000,
    equity: 500_000,
    closingCosts: 20_000,
    annualRent: 100_000,
    year1Opex: 20_000,
    rentGrowth: 0.03,
    expenseGrowth: 0.02,
    appreciation: 0.04,
    saleCosts: 0.05,
    holdYears: 5,
    discountRate: 0.08,
    annualDebtService: 70_000,
  });
  // First CF = equity + closing = −520K
  assert.equal(out.cashflows[0], -520_000);
  // Year-1 operating CF = NOI − debt = 80K − 70K = 10K
  assertNear(out.cashflows[1], 10_000, 0.5);
});

// ═══════════════════════════════════════════════════════════════════════════
//  10. Sensitivity matrix
// ═══════════════════════════════════════════════════════════════════════════

test('sensitivity — 3×3 matrix returned', () => {
  const baseCase = {
    purchase: 2_000_000,
    equity: 2_000_000,
    closingCosts: 0,
    annualRent: 100_000,
    year1Opex: 20_000,
    rentGrowth: 0.03,
    expenseGrowth: 0.02,
    appreciation: 0.04,
    saleCosts: 0.05,
    holdYears: 5,
    discountRate: 0.06,
  };
  const s = sensitivity({
    baseCase,
    vary: { cap: [-1, 0, 1], rent: [-5, 0, 5] },
  });
  // 3 cap rows × 3 rent columns
  assert.equal(s.grid.length, 3);
  assert.equal(s.grid[0].length, 3);
  // Flat length = 9
  assert.equal(s.flat.length, 9);
  // Headers preserved
  assert.deepEqual(s.headerCap, [-1, 0, 1]);
  assert.deepEqual(s.headerRent, [-5, 0, 5]);
  // The center cell (cap=0, rent=0) equals the base-case IRR
  const base = holdingPeriodAnalysis(baseCase);
  const center = s.grid[1][1];
  assert.equal(center.capDelta, 0);
  assert.equal(center.rentDelta, 0);
  assertNear(center.irr, base.irr, 1e-6);
});

test('sensitivity — monotonic in appreciation', () => {
  const baseCase = {
    purchase: 2_000_000,
    equity: 2_000_000,
    closingCosts: 0,
    annualRent: 100_000,
    year1Opex: 20_000,
    rentGrowth: 0.03,
    expenseGrowth: 0.02,
    appreciation: 0.04,
    saleCosts: 0.05,
    holdYears: 5,
    discountRate: 0.06,
  };
  const s = sensitivity({
    baseCase,
    vary: { cap: [-2, 0, 2], rent: [0] },
  });
  // Higher appreciation → higher IRR
  assert.ok(s.grid[0][0].irr < s.grid[1][0].irr);
  assert.ok(s.grid[1][0].irr < s.grid[2][0].irr);
});

// ═══════════════════════════════════════════════════════════════════════════
//  11. Israeli after-tax return
// ═══════════════════════════════════════════════════════════════════════════

test('israeliAfterTaxReturn — flat 10% track on annual rent', () => {
  const out = israeliAfterTaxReturn({
    annualRent: 60_000,
    track: 'flat',
  });
  // Tax = 6000, net = 54000
  assert.equal(out.rentalTax, 6_000);
  assert.equal(out.netRentalIncome, 54_000);
  assertNear(out.effectiveRentalRate, 0.10);
  assert.ok(out.citations.some((c) => c.includes('סעיף 122')));
});

test('israeliAfterTaxReturn — flat 10% track on monthly rent', () => {
  const out = israeliAfterTaxReturn({
    monthlyRent: 5_000,
    track: 'flat',
  });
  assert.equal(out.grossRentAnnual, 60_000);
  assert.equal(out.rentalTax, 6_000);
  assert.equal(out.effectiveRentalRate, ISRAELI_RENTAL_FLAT_RATE);
});

test('israeliAfterTaxReturn — exempt track below ceiling', () => {
  const out = israeliAfterTaxReturn({
    monthlyRent: 4_500, // below ~5654 ceiling
    track: 'exempt',
    exemptCeiling: ISRAELI_RENTAL_EXEMPT_CEILING_2026,
  });
  assert.equal(out.rentalTax, 0);
  assert.equal(out.netRentalIncome, 54_000);
});

test('israeliAfterTaxReturn — exempt track above ceiling phase-out', () => {
  const out = israeliAfterTaxReturn({
    monthlyRent: 7_000, // above ceiling → some tax applies
    track: 'exempt',
    exemptCeiling: 5_654,
  });
  assert.ok(out.rentalTax > 0);
  assert.ok(out.rentalTax < 7_000 * 12); // can't exceed gross
});

test('israeliAfterTaxReturn — regular track with deductions', () => {
  const out = israeliAfterTaxReturn({
    annualRent: 120_000,
    annualOpex: 20_000,
    annualInterest: 30_000,
    annualDepreciation: 10_000,
    track: 'regular',
  });
  // Taxable base = 120 - 20 - 30 - 10 = 60K, well inside first passive bracket (31%)
  // Tax = 60_000 × 0.31 = 18_600
  assertNear(out.rentalTax, 18_600, 1);
});

test('israeliAfterTaxReturn — unknown track throws', () => {
  assert.throws(
    () => israeliAfterTaxReturn({ annualRent: 100_000, track: 'bogus' }),
    /unknown track/
  );
});

test('israeliAfterTaxReturn — betterment tax on sale (individual)', () => {
  const out = israeliAfterTaxReturn({
    annualRent: 60_000,
    track: 'flat',
    sale: {
      purchase: 1_500_000,
      price: 2_000_000,
      improvements: 50_000,
      isIndividual: true,
    },
  });
  // Nominal betterment = 2M − 1.5M − 50K = 450K
  // Tax = 450K × 25% = 112_500
  assert.equal(out.betterment.nominal, 450_000);
  assert.equal(out.betterment.rate, ISRAELI_BETTERMENT_INDIV_RATE);
  assert.equal(out.betterment.tax, 112_500);
});

test('israeliAfterTaxReturn — linear exempt for primary residence', () => {
  // Property held 20 years, 10 of which are pre-2014-01-01 → 50% exempt
  const out = israeliAfterTaxReturn({
    annualRent: 0,
    track: 'flat',
    sale: {
      purchase: 1_000_000,
      price: 2_000_000,
      improvements: 0,
      isIndividual: true,
      linearExempt: true,
      holdYears: 20,
      preSplitYears: 10,
    },
  });
  // Nominal 1M → taxable portion 500K → tax = 125K
  assert.equal(out.betterment.nominal, 1_000_000);
  assert.equal(out.betterment.taxable, 500_000);
  assert.equal(out.betterment.tax, 125_000);
});

test('israeliAfterTaxReturn — no sale means no betterment key', () => {
  const out = israeliAfterTaxReturn({
    annualRent: 60_000,
    track: 'flat',
  });
  assert.equal(out.betterment, null);
});

test('israeliAfterTaxReturn — negative nominal betterment = no tax', () => {
  const out = israeliAfterTaxReturn({
    annualRent: 0,
    track: 'flat',
    sale: {
      purchase: 2_000_000,
      price: 1_800_000, // sold at a loss
      isIndividual: true,
    },
  });
  assert.equal(out.betterment.tax, 0);
  assert.equal(out.betterment.taxable, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
//  12. Integration — end-to-end flow
// ═══════════════════════════════════════════════════════════════════════════

test('integration — underwrite a TLV 3BR apartment', () => {
  // Scenario: ₪3M apt, 30% down, 70% mortgage at 5% over 25y
  // Gross rent ₪9K/mo, opex ₪1K/mo
  const price = 3_000_000;
  const annualRent = 9_000 * 12; // 108K
  const opex = 1_000 * 12; // 12K
  const noi = annualRent - opex; // 96K
  const equity = 0.30 * price; // 900K
  const loan = 0.70 * price; // 2.1M
  // 25-year annuity payment at 5% annual on 2.1M
  // P = L × r / (1 − (1+r)^-n) = 2.1M × 0.05 / (1 − 1.05^-25) ≈ 149_017
  const annualDebt = 149_017;

  // Ratios
  assertNear(capRate(noi, price), 0.032);
  assertNear(grossYield({ annualRent, price }), 0.036);
  assertNear(netYield({ annualRent, opex, price }), 0.032);
  assert.equal(ltv({ loan, value: price }), 0.70);

  // DSCR
  const d = dscr({ noi, annualDebtService: annualDebt });
  assert.ok(d < 1); // under-levered for this yield, classic TLV distress

  // Cash on cash (pre-tax)
  const coc = cashOnCash({
    annualCashFlow: noi - annualDebt,
    totalCashInvested: equity,
  });
  assert.ok(coc < 0); // slightly negative — typical for TLV residential

  // Apply Israeli flat 10% on rental
  const tax = israeliAfterTaxReturn({ annualRent, track: 'flat' });
  assert.equal(tax.rentalTax, 10_800);
  assert.equal(tax.netRentalIncome, 97_200);
});

test('LAW_CITATIONS — all Hebrew strings present', () => {
  assert.ok(LAW_CITATIONS.rental_flat_track.includes('122'));
  assert.ok(LAW_CITATIONS.rental_exempt_track.includes('1990'));
  assert.ok(LAW_CITATIONS.betterment_general.includes('48א'));
  assert.ok(LAW_CITATIONS.real_betterment.includes('47'));
});
