/**
 * Unit tests for src/realestate/valuation.js
 * Run with: node --test test/realestate/valuation.test.js
 *
 * Coverage:
 *   • comparableMethod — adjustment logic (size, age, condition, location,
 *     floor, amenities, max-adjust cap)
 *   • incomeMethod — direct cap, DCF, BOI-adjusted cap auto-detection
 *   • costMethod — land + replacement, age depreciation, condition modifier
 *   • residualMethod — GDV backout, negative residual sanity
 *   • Israeli factors — tabu, דייר מוגן, ועד בית, תמ"א 38, פינוי בינוי
 *   • neighborhoodIndex — city/neighborhood/default fallback chain
 *   • fetchComparables — stub contract + injected fetcher
 *   • getMsyOPIRate / getBoiAdjustedCapRate
 *   • valuate() top-level dispatcher — all four methods
 *   • error handling & input validation
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const mod = require('../../src/realestate/valuation.js');
const {
  PropertyValuator,
  ADJUSTMENT_WEIGHTS,
  ISRAELI_FACTORS,
  NEIGHBORHOOD_INDEX_BASE,
  BANK_OF_ISRAEL_DEFAULT_RATE,
  CAP_RATE_BY_TYPE,
  DEPRECIATION_TABLES,
  VALUATION_METHOD_LABELS,
  _internals,
} = mod;

// ═══════════════════════════════════════════════════════════════
// Constants sanity
// ═══════════════════════════════════════════════════════════════

describe('constants', () => {
  test('BANK_OF_ISRAEL_DEFAULT_RATE is a fraction', () => {
    assert.equal(typeof BANK_OF_ISRAEL_DEFAULT_RATE, 'number');
    assert.ok(BANK_OF_ISRAEL_DEFAULT_RATE > 0 && BANK_OF_ISRAEL_DEFAULT_RATE < 0.5);
  });

  test('CAP_RATE_BY_TYPE has apartment/office/retail', () => {
    assert.ok(CAP_RATE_BY_TYPE.apartment > 0);
    assert.ok(CAP_RATE_BY_TYPE.office > 0);
    assert.ok(CAP_RATE_BY_TYPE.retail > 0);
    assert.ok(CAP_RATE_BY_TYPE.default > 0);
  });

  test('ISRAELI_FACTORS tabu values all < 1 except clean', () => {
    assert.equal(ISRAELI_FACTORS.tabu.clean.factor, 1.0);
    assert.ok(ISRAELI_FACTORS.tabu.liens.factor < 1);
    assert.ok(ISRAELI_FACTORS.tabu.unregistered.factor < 1);
    assert.ok(ISRAELI_FACTORS.tabu.defective.factor < 1);
  });

  test('ISRAELI_FACTORS preserved tenant present factor is 0.55', () => {
    assert.equal(ISRAELI_FACTORS.preservedTenant.present.factor, 0.55);
  });

  test('TAMA 38 phase 2 permit > phase 2 signed > phase 2 potential', () => {
    assert.ok(ISRAELI_FACTORS.tama38.phase2PermitIssued.factor >
      ISRAELI_FACTORS.tama38.phase2Signed.factor);
    assert.ok(ISRAELI_FACTORS.tama38.phase2Signed.factor >
      ISRAELI_FACTORS.tama38.phase2Potential.factor);
  });

  test('VALUATION_METHOD_LABELS contains all four methods', () => {
    assert.equal(VALUATION_METHOD_LABELS.comparable.he, 'גישת ההשוואה');
    assert.equal(VALUATION_METHOD_LABELS.income.he, 'גישת ההכנסות');
    assert.equal(VALUATION_METHOD_LABELS.cost.he, 'גישת העלות');
    assert.equal(VALUATION_METHOD_LABELS.residual.he, 'גישת השייר');
  });
});

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

describe('internal helpers', () => {
  test('round0 rounds to integer', () => {
    assert.equal(_internals.round0(1.49), 1);
    assert.equal(_internals.round0(1.5), 2);
    assert.equal(_internals.round0(NaN), 0);
  });

  test('round2 rounds to 2 decimals', () => {
    assert.equal(_internals.round2(1.234), 1.23);
    assert.equal(_internals.round2(1.235), 1.24);
  });

  test('clamp bounds a value', () => {
    assert.equal(_internals.clamp(5, 0, 10), 5);
    assert.equal(_internals.clamp(-5, 0, 10), 0);
    assert.equal(_internals.clamp(15, 0, 10), 10);
  });

  test('conditionMultiplier lookup', () => {
    assert.equal(_internals.conditionMultiplier('new'), 1.08);
    assert.equal(_internals.conditionMultiplier('poor'), 0.88);
    assert.equal(_internals.conditionMultiplier('very_poor'), 0.75);
    assert.equal(_internals.conditionMultiplier('unknown'), 1.0);
  });

  test('capRateKey falls back to default', () => {
    assert.equal(_internals.capRateKey('apartment'), 'apartment');
    assert.equal(_internals.capRateKey('unknown_type'), 'default');
  });
});

// ═══════════════════════════════════════════════════════════════
// comparableMethod
// ═══════════════════════════════════════════════════════════════

describe('comparableMethod', () => {
  const v = new PropertyValuator();
  const subject = {
    sizeSqm: 100,
    yearBuilt: 2020,
    condition: 'good',
    floor: 5,
    hasElevator: true,
    hasParking: true,
    hasBalcony: true,
  };
  const baseComp = {
    salePrice: 3_000_000,
    sizeSqm: 100,
    yearBuilt: 2020,
    condition: 'good',
    distanceKm: 0,
    floor: 5,
    hasElevator: true,
    hasParking: true,
    hasBalcony: true,
  };

  test('zero adjustments — identical subject/comp — returns comp price', () => {
    const r = v.comparableMethod({ subject, comparables: [baseComp] });
    assert.equal(r.method, 'comparable');
    assert.equal(r.likely, 3_000_000);
  });

  test('size is applied via price-per-sqm * subject size', () => {
    const r = v.comparableMethod({
      subject: { ...subject, sizeSqm: 120 },
      comparables: [baseComp],
    });
    // 30000 per sqm * 120 = 3_600_000
    assert.equal(r.likely, 3_600_000);
  });

  test('age adjustment — newer subject is worth more', () => {
    const r = v.comparableMethod({
      subject: { ...subject, yearBuilt: 2025 }, // 5 years newer
      comparables: [{ ...baseComp, yearBuilt: 2020 }],
    });
    // +5 years * 0.5% = +2.5% => ~3_075_000
    assert.ok(r.likely > 3_000_000);
    const appliedAge = r.breakdown.comparablesAnalyzed[0].appliedAdjustments.find((a) => a.type === 'age');
    assert.equal(appliedAge.diff, 5);
    assert.equal(appliedAge.pct, 2.5);
  });

  test('condition adjustment — better subject worth more', () => {
    const r = v.comparableMethod({
      subject: { ...subject, condition: 'new' }, // 1.08
      comparables: [{ ...baseComp, condition: 'good' }], // 1.0
    });
    assert.ok(r.likely > 3_000_000);
  });

  test('location adjustment — distant comparable penalized', () => {
    const r = v.comparableMethod({
      subject,
      comparables: [{ ...baseComp, distanceKm: 3 }],
    });
    // -3 * 1.5% = -4.5% on the price-per-sqm
    assert.ok(r.likely < 3_000_000);
    const appliedLoc = r.breakdown.comparablesAnalyzed[0].appliedAdjustments.find((a) => a.type === 'location');
    assert.equal(appliedLoc.diff, 3);
    assert.equal(appliedLoc.pct, -4.5);
  });

  test('floor adjustment — higher subject floor is a bonus', () => {
    const r = v.comparableMethod({
      subject: { ...subject, floor: 8 },
      comparables: [{ ...baseComp, floor: 3 }],
    });
    assert.ok(r.likely > 3_000_000);
  });

  test('amenities — subject has parking, comp does not', () => {
    const r = v.comparableMethod({
      subject,
      comparables: [{ ...baseComp, hasParking: false }],
    });
    assert.ok(r.likely > 3_000_000);
  });

  test('empty comparables returns zero + note', () => {
    const r = v.comparableMethod({ subject, comparables: [] });
    assert.equal(r.likely, 0);
    assert.ok(r.notes.length > 0);
    assert.match(r.notes[0].he, /אין עסקאות/);
  });

  test('max adjustment cap fires on extreme diff', () => {
    const r = v.comparableMethod({
      subject: {
        sizeSqm: 100,
        yearBuilt: 1950,
        condition: 'very_poor',
        floor: 0,
        hasElevator: false,
        hasParking: false,
        hasBalcony: false,
        hasSafeRoom: false,
        hasStorage: false,
      },
      comparables: [{
        salePrice: 10_000_000,
        sizeSqm: 100,
        yearBuilt: 2025,
        condition: 'new',
        distanceKm: 6,
        floor: 10,
        hasElevator: true,
        hasParking: true,
        hasBalcony: true,
        hasSafeRoom: true,
        hasStorage: true,
      }],
    });
    const capApplied = r.breakdown.comparablesAnalyzed[0].appliedAdjustments
      .some((a) => a.type === 'cap');
    assert.ok(capApplied, 'max-adjustment cap must fire on extreme diff');
  });

  test('median and mean blended for likely', () => {
    const r = v.comparableMethod({
      subject: { ...subject, sizeSqm: 100 },
      comparables: [
        { ...baseComp, salePrice: 2_800_000 },
        { ...baseComp, salePrice: 3_000_000 },
        { ...baseComp, salePrice: 3_200_000 },
      ],
    });
    // price/sqm: 28000, 30000, 32000 → median 30000, mean 30000 → 3_000_000
    assert.equal(r.likely, 3_000_000);
    assert.equal(r.low, 2_800_000);
    assert.equal(r.high, 3_200_000);
  });

  test('invalid comparables are filtered', () => {
    const r = v.comparableMethod({
      subject: { ...subject, sizeSqm: 100 },
      comparables: [
        { ...baseComp }, // valid
        { ...baseComp, salePrice: -100 }, // invalid price
        { ...baseComp, sizeSqm: 0 }, // invalid size
      ],
    });
    assert.equal(r.breakdown.comparablesAnalyzed.length, 1);
  });

  test('throws on missing subject', () => {
    assert.throws(() => v.comparableMethod({ comparables: [] }), /subject required/);
  });
});

// ═══════════════════════════════════════════════════════════════
// incomeMethod
// ═══════════════════════════════════════════════════════════════

describe('incomeMethod', () => {
  const v = new PropertyValuator({ boiRate: 0.035 }); // long-run neutral

  test('direct-cap core formula — NOI / capRate', () => {
    const r = v.incomeMethod({
      rentalIncome: 120_000,
      operatingExpenses: 0,
      capRate: 0.04,
      vacancy: 0,
      growthRate: 0,
      discountRate: 0.04,
    });
    // NOI = 120_000, directCap = 3_000_000
    assert.equal(r.breakdown.directCap, 3_000_000);
    assert.equal(r.breakdown.capRate, 0.04);
  });

  test('vacancy reduces effective gross', () => {
    const r = v.incomeMethod({
      rentalIncome: 100_000,
      operatingExpenses: 0,
      capRate: 0.05,
      vacancy: 0.10,
      growthRate: 0,
    });
    // effective gross = 90_000, NOI = 90_000, direct = 1_800_000
    assert.equal(r.breakdown.effectiveGross, 90_000);
    assert.equal(r.breakdown.directCap, 1_800_000);
  });

  test('operating expenses reduce NOI', () => {
    const r = v.incomeMethod({
      rentalIncome: 100_000,
      operatingExpenses: 20_000,
      capRate: 0.05,
      vacancy: 0,
      growthRate: 0,
    });
    assert.equal(r.breakdown.noi, 80_000);
    assert.equal(r.breakdown.directCap, 1_600_000);
  });

  test('DCF with growth produces higher likely than zero-growth direct cap', () => {
    const r1 = v.incomeMethod({
      rentalIncome: 100_000,
      capRate: 0.05,
      vacancy: 0,
      growthRate: 0.03,
      discountRate: 0.06,
    });
    const r2 = v.incomeMethod({
      rentalIncome: 100_000,
      capRate: 0.05,
      vacancy: 0,
      growthRate: 0.0,
      discountRate: 0.06,
    });
    assert.ok(r1.likely > r2.likely);
  });

  test('auto cap rate from property type when not provided', () => {
    const r = v.incomeMethod({
      rentalIncome: 100_000,
      propertyType: 'office',
    });
    // Auto cap should equal CAP_RATE_BY_TYPE.office when BOI == long-run
    assert.equal(r.breakdown.capRate, CAP_RATE_BY_TYPE.office);
  });

  test('throws on missing/invalid rentalIncome', () => {
    assert.throws(() => v.incomeMethod({ rentalIncome: 0 }), /rentalIncome/);
    assert.throws(() => v.incomeMethod({}), /rentalIncome/);
  });

  test('low < likely < high sensitivity', () => {
    const r = v.incomeMethod({
      rentalIncome: 100_000,
      capRate: 0.05,
      vacancy: 0,
      growthRate: 0.02,
    });
    assert.ok(r.low < r.likely);
    assert.ok(r.high > r.likely);
  });
});

// ═══════════════════════════════════════════════════════════════
// costMethod
// ═══════════════════════════════════════════════════════════════

describe('costMethod', () => {
  const v = new PropertyValuator({ asOfYear: 2026 });

  test('core formula — land + replacement − depreciation', () => {
    const r = v.costMethod({
      landValue: 2_000_000,
      replacementCost: 1_500_000,
      depreciation: 0, // no depreciation
    });
    assert.equal(r.likely, 3_500_000);
  });

  test('explicit depreciation ILS amount subtracted', () => {
    const r = v.costMethod({
      landValue: 1_000_000,
      replacementCost: 1_000_000,
      depreciation: 300_000,
    });
    assert.equal(r.likely, 1_700_000);
    assert.equal(r.breakdown.depreciationAmount, 300_000);
  });

  test('explicit depreciation fraction subtracted', () => {
    const r = v.costMethod({
      landValue: 1_000_000,
      replacementCost: 1_000_000,
      depreciation: { fraction: 0.25 },
    });
    assert.equal(r.likely, 1_750_000);
    assert.equal(r.breakdown.depreciationFraction, 0.25);
  });

  test('age-based depreciation for apartment (80y life)', () => {
    const r = v.costMethod({
      landValue: 1_000_000,
      replacementCost: 1_600_000,
      yearBuilt: 2006, // 20 years old in 2026
      propertyType: 'apartment',
      condition: 'good',
    });
    // 20 * (1/80) = 25% fraction, 0.25 * 1_600_000 = 400_000
    assert.equal(r.breakdown.depreciationFraction, 0.25);
    assert.equal(r.likely, 1_000_000 + 1_600_000 - 400_000);
  });

  test('condition accelerates depreciation when poor', () => {
    const base = v.costMethod({
      landValue: 0,
      replacementCost: 1_000_000,
      yearBuilt: 2006,
      propertyType: 'apartment',
      condition: 'good',
    });
    const poor = v.costMethod({
      landValue: 0,
      replacementCost: 1_000_000,
      yearBuilt: 2006,
      propertyType: 'apartment',
      condition: 'poor',
    });
    assert.ok(poor.likely < base.likely);
  });

  test('min value factor floor protects old buildings', () => {
    const r = v.costMethod({
      landValue: 0,
      replacementCost: 1_000_000,
      yearBuilt: 1900, // 126 years old
      propertyType: 'apartment',
      condition: 'good',
    });
    // min value factor = 0.30 → max dep = 0.70 → likely >= 300_000
    assert.ok(r.likely >= 300_000);
  });

  test('throws on negative land value', () => {
    assert.throws(() => v.costMethod({ landValue: -1, replacementCost: 0 }), /landValue/);
  });

  test('throws on negative replacement cost', () => {
    assert.throws(() => v.costMethod({ landValue: 0, replacementCost: -1 }), /replacementCost/);
  });

  test('low/high band ±10% around likely', () => {
    const r = v.costMethod({
      landValue: 1_000_000,
      replacementCost: 1_000_000,
      depreciation: 0,
    });
    assert.equal(r.low, 1_800_000);
    assert.equal(r.high, 2_200_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// residualMethod
// ═══════════════════════════════════════════════════════════════

describe('residualMethod', () => {
  const v = new PropertyValuator();

  test('basic residual — GDV minus all costs', () => {
    const r = v.residualMethod({
      gdv: 10_000_000,
      constructionCost: 5_000_000,
      profit: 0.17,
      finance: 0.05,
      softCosts: 0.08,
      contingency: 0.05,
    });
    // costs = 5M + 0.17*10M + 0.05*10M + 0.08*10M + 0.05*10M
    //       = 5M + 1.7M + 0.5M + 0.8M + 0.5M = 8.5M
    // residual = 10M - 8.5M = 1.5M
    assert.equal(r.likely, 1_500_000);
  });

  test('construction cost as fraction of GDV', () => {
    const r = v.residualMethod({
      gdv: 10_000_000,
      constructionCost: 0.5, // 50% of GDV
      profit: 0.1,
      finance: 0.05,
      softCosts: 0.05,
      contingency: 0.05,
    });
    // 0.5*10M + (0.1+0.05+0.05+0.05)*10M = 5M + 2.5M = 7.5M
    assert.equal(r.likely, 2_500_000);
  });

  test('negative residual clamped to 0 with warning note', () => {
    const r = v.residualMethod({
      gdv: 5_000_000,
      constructionCost: 6_000_000,
      profit: 0.17,
      finance: 0.05,
      softCosts: 0.08,
      contingency: 0.05,
    });
    assert.equal(r.likely, 0);
    const hasWarning = r.notes.some((n) => /שלילי/.test(n.he) || /Negative/.test(n.en));
    assert.ok(hasWarning, 'must warn on negative residual');
  });

  test('defaults applied when profit/finance omitted', () => {
    const r = v.residualMethod({
      gdv: 10_000_000,
      constructionCost: 5_000_000,
    });
    // defaults: profit 17%, finance 5%, soft 8%, contingency 5% → 35% + 5M
    // residual = 10M - 5M - 3.5M = 1.5M
    assert.equal(r.likely, 1_500_000);
  });

  test('absolute cost object forms accepted', () => {
    const r = v.residualMethod({
      gdv: 10_000_000,
      constructionCost: 5_000_000,
      profit: { amount: 2_000_000 },
      finance: { amount: 500_000 },
      softCosts: { fraction: 0 },
      contingency: { fraction: 0 },
    });
    // residual = 10M - 5M - 2M - 0.5M = 2.5M
    assert.equal(r.likely, 2_500_000);
  });

  test('throws on zero GDV', () => {
    assert.throws(() => v.residualMethod({ gdv: 0, constructionCost: 1_000 }), /gdv/);
  });

  test('low/high uncertainty band', () => {
    const r = v.residualMethod({
      gdv: 10_000_000,
      constructionCost: 5_000_000,
      profit: 0.17,
      finance: 0.05,
      softCosts: 0.08,
      contingency: 0.05,
    });
    assert.ok(r.low <= r.likely);
    assert.ok(r.high >= r.likely);
  });
});

// ═══════════════════════════════════════════════════════════════
// Israeli factors — applied via valuate()
// ═══════════════════════════════════════════════════════════════

describe('Israeli-specific factors', () => {
  const v = new PropertyValuator({ asOfYear: 2026 });
  const baseInputs = {
    method: 'cost',
    inputs: { landValue: 1_000_000, replacementCost: 1_000_000, depreciation: 0 },
  };

  test('preserved tenant drops value ~45%', () => {
    const without = v.valuate({}, baseInputs);
    const withTenant = v.valuate({ hasPreservedTenant: true }, baseInputs);
    assert.ok(withTenant.likely < without.likely);
    const ratio = withTenant.likely / without.likely;
    assert.ok(ratio > 0.50 && ratio < 0.60, `ratio ${ratio} should be ~0.55`);
  });

  test('committee dispute moderately reduces value', () => {
    const without = v.valuate({}, baseInputs);
    const withDispute = v.valuate({ hasCommitteeDispute: true }, baseInputs);
    assert.ok(withDispute.likely < without.likely);
    const ratio = withDispute.likely / without.likely;
    assert.ok(ratio > 0.94 && ratio < 0.99);
  });

  test('defective tabu drops value to ~70%', () => {
    const clean = v.valuate({ tabuStatus: 'clean' }, baseInputs);
    const defective = v.valuate({ tabuStatus: 'defective' }, baseInputs);
    const ratio = defective.likely / clean.likely;
    assert.ok(ratio > 0.65 && ratio < 0.75);
  });

  test('unregistered tabu drops value to ~85%', () => {
    const clean = v.valuate({ tabuStatus: 'clean' }, baseInputs);
    const unreg = v.valuate({ tabuStatus: 'unregistered' }, baseInputs);
    const ratio = unreg.likely / clean.likely;
    assert.ok(ratio > 0.82 && ratio < 0.88);
  });

  test('TAMA 38 phase 2 signed increases value ~22%', () => {
    const without = v.valuate({}, baseInputs);
    const withTama = v.valuate({ tama38: { phase2: true, signed: true } }, baseInputs);
    const ratio = withTama.likely / without.likely;
    assert.ok(ratio > 1.20 && ratio < 1.25);
  });

  test('TAMA 38 phase 2 permit issued > phase 2 signed', () => {
    const signed = v.valuate({ tama38: { phase2: true, signed: true } }, baseInputs);
    const permit = v.valuate({ tama38: { phase2: true, permitIssued: true } }, baseInputs);
    assert.ok(permit.likely > signed.likely);
  });

  test('TAMA 38 phase 1 increase < phase 2 increase', () => {
    const p1 = v.valuate({ tama38: { phase1: true } }, baseInputs);
    const p2 = v.valuate({ tama38: { phase2: true } }, baseInputs);
    assert.ok(p2.likely > p1.likely);
  });

  test('Pinui-Binui approved bumps ~20%', () => {
    const without = v.valuate({}, baseInputs);
    const withPb = v.valuate({ pinuiBinui: { approved: true } }, baseInputs);
    const ratio = withPb.likely / without.likely;
    assert.ok(ratio > 1.18 && ratio < 1.22);
  });

  test('Pinui-Binui eligible < approved', () => {
    const eligible = v.valuate({ pinuiBinui: { eligible: true } }, baseInputs);
    const approved = v.valuate({ pinuiBinui: { approved: true } }, baseInputs);
    assert.ok(approved.likely > eligible.likely);
  });

  test('compound effect — preserved tenant + TAMA 38 still heavily negative', () => {
    const combined = v.valuate({
      hasPreservedTenant: true,
      tama38: { phase1: true },
    }, baseInputs);
    const baseline = v.valuate({}, baseInputs);
    assert.ok(combined.likely < baseline.likely);
  });
});

// ═══════════════════════════════════════════════════════════════
// neighborhoodIndex
// ═══════════════════════════════════════════════════════════════

describe('neighborhoodIndex', () => {
  const v = new PropertyValuator();

  test('exact city+neighborhood match', () => {
    assert.equal(v.neighborhoodIndex('תל אביב', 'פלורנטין'), 1.35);
    assert.equal(v.neighborhoodIndex('תל אביב', 'לב תל אביב'), 1.60);
  });

  test('fallback to city default', () => {
    assert.equal(v.neighborhoodIndex('תל אביב', 'unknown'), 1.40);
  });

  test('fallback to global default', () => {
    assert.equal(v.neighborhoodIndex('UnknownCity'), 1.0);
    assert.equal(v.neighborhoodIndex('UnknownCity', 'UnknownHood'), 1.0);
  });

  test('empty city returns 1.0', () => {
    assert.equal(v.neighborhoodIndex(''), 1.0);
    assert.equal(v.neighborhoodIndex(null), 1.0);
  });

  test('periphery factor < 1', () => {
    assert.ok(v.neighborhoodIndex('באר שבע') < 1.0);
    assert.ok(v.neighborhoodIndex('דימונה') < 1.0);
  });

  test('prime coastal > 1', () => {
    assert.ok(v.neighborhoodIndex('הרצליה', 'הרצליה פיתוח') > 1.5);
  });

  test('neighborhood index applied to valuation', () => {
    const v2 = new PropertyValuator({ asOfYear: 2026 });
    const plain = v2.valuate({}, {
      method: 'cost',
      inputs: { landValue: 1_000_000, replacementCost: 0, depreciation: 0 },
    });
    const tlv = v2.valuate({ city: 'תל אביב', neighborhood: 'לב תל אביב' }, {
      method: 'cost',
      inputs: { landValue: 1_000_000, replacementCost: 0, depreciation: 0 },
    });
    assert.ok(tlv.likely > plain.likely);
  });
});

// ═══════════════════════════════════════════════════════════════
// fetchComparables stub + injected fetcher
// ═══════════════════════════════════════════════════════════════

describe('fetchComparables', () => {
  test('default stub returns array-like with source metadata', async () => {
    const v = new PropertyValuator();
    const comps = await v.fetchComparables(12345, 67, 1.5);
    assert.ok(Array.isArray(comps));
    assert.equal(comps.length, 0);
    assert.equal(comps._source, 'stub:rashut-hamisim:nadlan');
    assert.equal(comps._query.gush, 12345);
    assert.equal(comps._query.helka, 67);
    assert.equal(comps._query.radiusKm, 1.5);
  });

  test('injected fetcher is called', async () => {
    const mockComps = [
      { salePrice: 3_000_000, sizeSqm: 100, yearBuilt: 2015, condition: 'good' },
    ];
    const v = new PropertyValuator({
      comparablesFetcher: async (gush, helka, radiusKm) => {
        assert.equal(gush, 100);
        assert.equal(helka, 200);
        assert.equal(radiusKm, 2);
        return mockComps;
      },
    });
    const result = await v.fetchComparables(100, 200, 2);
    assert.equal(result.length, 1);
    assert.equal(result[0].salePrice, 3_000_000);
  });

  test('throws on missing gush/helka', async () => {
    const v = new PropertyValuator();
    await assert.rejects(() => v.fetchComparables(), /gush and helka/);
    await assert.rejects(() => v.fetchComparables(1), /gush and helka/);
  });
});

// ═══════════════════════════════════════════════════════════════
// BOI rate + adjusted cap rate
// ═══════════════════════════════════════════════════════════════

describe('Bank of Israel rate integration', () => {
  test('getMsyOPIRate returns the constructor rate', () => {
    const v = new PropertyValuator({ boiRate: 0.05 });
    assert.equal(v.getMsyOPIRate(), 0.05);
  });

  test('default rate falls back to BANK_OF_ISRAEL_DEFAULT_RATE', () => {
    const v = new PropertyValuator();
    assert.equal(v.getMsyOPIRate(), BANK_OF_ISRAEL_DEFAULT_RATE);
  });

  test('cap rate rises with BOI base rate', () => {
    const low = new PropertyValuator({ boiRate: 0.02 });
    const high = new PropertyValuator({ boiRate: 0.06 });
    assert.ok(high.getBoiAdjustedCapRate('apartment') > low.getBoiAdjustedCapRate('apartment'));
  });

  test('cap rate floor at 2%', () => {
    const v = new PropertyValuator({ boiRate: 0.00 });
    const cap = v.getBoiAdjustedCapRate('apartment');
    assert.ok(cap >= 0.02);
  });

  test('unknown property type falls back to default', () => {
    const v = new PropertyValuator({ boiRate: 0.035 });
    const cap = v.getBoiAdjustedCapRate('spaceship');
    assert.equal(cap, CAP_RATE_BY_TYPE.default);
  });

  test('incomeMethod picks up BOI-adjusted rate when cap omitted', () => {
    const vLow = new PropertyValuator({ boiRate: 0.02 });
    const vHigh = new PropertyValuator({ boiRate: 0.06 });
    const rLow = vLow.incomeMethod({ rentalIncome: 100_000, propertyType: 'apartment' });
    const rHigh = vHigh.incomeMethod({ rentalIncome: 100_000, propertyType: 'apartment' });
    // Higher BOI → higher cap → lower value
    assert.ok(rHigh.breakdown.directCap < rLow.breakdown.directCap);
  });
});

// ═══════════════════════════════════════════════════════════════
// valuate() top-level dispatcher
// ═══════════════════════════════════════════════════════════════

describe('valuate() dispatcher', () => {
  const v = new PropertyValuator({ asOfYear: 2026 });

  test('dispatches to comparable', () => {
    const r = v.valuate(
      { sizeSqm: 100 },
      {
        method: 'comparable',
        inputs: {
          comparables: [{ salePrice: 3_000_000, sizeSqm: 100 }],
        },
      },
    );
    assert.equal(r.method, 'comparable');
    assert.ok(r.likely > 0);
    assert.equal(r.meta.currency, 'ILS');
    assert.ok(r.meta.computedAt);
  });

  test('dispatches to income', () => {
    const r = v.valuate({ propertyType: 'apartment' }, {
      method: 'income',
      inputs: { rentalIncome: 100_000, capRate: 0.05 },
    });
    assert.equal(r.method, 'income');
    assert.ok(r.likely > 0);
  });

  test('dispatches to cost', () => {
    const r = v.valuate({}, {
      method: 'cost',
      inputs: { landValue: 1_000_000, replacementCost: 1_000_000, depreciation: 0 },
    });
    assert.equal(r.method, 'cost');
    assert.equal(r.likely, 2_000_000);
  });

  test('dispatches to residual', () => {
    const r = v.valuate({}, {
      method: 'residual',
      inputs: { gdv: 10_000_000, constructionCost: 5_000_000 },
    });
    assert.equal(r.method, 'residual');
    assert.equal(r.likely, 1_500_000);
  });

  test('throws on missing method', () => {
    assert.throws(() => v.valuate({}, {}), /method is required/);
  });

  test('throws on unknown method', () => {
    assert.throws(
      () => v.valuate({}, { method: 'crystal_ball' }),
      /unknown method/,
    );
  });

  test('throws on missing property', () => {
    assert.throws(() => v.valuate(null, { method: 'cost' }), /property is required/);
  });

  test('result contains bilingual methodLabel', () => {
    const r = v.valuate({}, {
      method: 'cost',
      inputs: { landValue: 1_000_000, replacementCost: 0, depreciation: 0 },
    });
    assert.equal(r.methodLabel.he, 'גישת העלות');
    assert.equal(r.methodLabel.en, 'Cost approach');
  });

  test('result contains notes array', () => {
    const r = v.valuate({ hasPreservedTenant: true }, {
      method: 'cost',
      inputs: { landValue: 1_000_000, replacementCost: 0, depreciation: 0 },
    });
    assert.ok(Array.isArray(r.notes));
    const hasHebrewNote = r.notes.some((n) => /דייר מוגן/.test(n.he));
    assert.ok(hasHebrewNote, 'preserved tenant must appear in notes');
  });

  test('result is integer-rounded', () => {
    const r = v.valuate({}, {
      method: 'cost',
      inputs: { landValue: 1_234_567.89, replacementCost: 0, depreciation: 0 },
    });
    assert.equal(r.likely, Math.round(r.likely));
    assert.equal(r.low, Math.round(r.low));
    assert.equal(r.high, Math.round(r.high));
  });

  test('low <= likely <= high always holds', () => {
    const methods = [
      { method: 'cost', inputs: { landValue: 1_000_000, replacementCost: 1_000_000, depreciation: 0 } },
      { method: 'income', inputs: { rentalIncome: 100_000, capRate: 0.05 } },
      { method: 'residual', inputs: { gdv: 10_000_000, constructionCost: 5_000_000 } },
    ];
    for (const m of methods) {
      const r = v.valuate({}, m);
      assert.ok(r.low <= r.likely, `${m.method}: low > likely`);
      assert.ok(r.likely <= r.high, `${m.method}: likely > high`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// End-to-end — full property with all Israeli factors
// ═══════════════════════════════════════════════════════════════

describe('end-to-end integration', () => {
  test('Tel Aviv apartment with TAMA 38 potential', () => {
    const v = new PropertyValuator({ asOfYear: 2026, boiRate: 0.045 });
    const subject = {
      city: 'תל אביב',
      neighborhood: 'פלורנטין',
      propertyType: 'apartment',
      sizeSqm: 80,
      yearBuilt: 1970,
      condition: 'average',
      floor: 3,
      totalFloors: 4,
      hasElevator: false,
      hasParking: false,
      hasBalcony: true,
      hasSafeRoom: false,
      tabuStatus: 'clean',
      hasPreservedTenant: false,
      hasCommitteeDispute: false,
      tama38: { phase2: true, signed: true },
    };
    const comparables = [
      { salePrice: 2_400_000, sizeSqm: 75, yearBuilt: 1972, condition: 'average', distanceKm: 0.5 },
      { salePrice: 2_600_000, sizeSqm: 80, yearBuilt: 1975, condition: 'good', distanceKm: 0.3 },
      { salePrice: 2_200_000, sizeSqm: 70, yearBuilt: 1968, condition: 'poor', distanceKm: 0.7 },
    ];
    const r = v.valuate(subject, { method: 'comparable', inputs: { comparables } });
    assert.ok(r.likely > 0);
    // Should have Hebrew notes
    const heNotes = r.notes.map((n) => n.he).join('|');
    assert.ok(/תמ"א 38/.test(heNotes) || /תמ"א/.test(heNotes), 'must mention TAMA 38');
    assert.ok(/מדד שכונה|שכונה/.test(heNotes), 'must mention neighborhood');
  });

  test('Income method on Tel Aviv office under rising rates', () => {
    const v = new PropertyValuator({ boiRate: 0.055 }); // 5.5% BOI
    const subject = {
      city: 'תל אביב',
      propertyType: 'office',
      sizeSqm: 500,
    };
    const r = v.valuate(subject, {
      method: 'income',
      inputs: {
        rentalIncome: 600_000, // 100 ILS/sqm/month * 500 sqm * 12
        operatingExpenses: 90_000,
        vacancy: 0.08,
      },
    });
    // cap auto-adjusted upward from 6.5% baseline because BOI > long-run
    assert.ok(r.breakdown.capRate > CAP_RATE_BY_TYPE.office);
    assert.ok(r.likely > 0);
  });

  test('Residual site valuation with TAMA 38/2 permit', () => {
    const v = new PropertyValuator();
    const subject = {
      city: 'רמת גן',
      propertyType: 'apartment',
      tama38: { phase2: true, permitIssued: true },
    };
    const r = v.valuate(subject, {
      method: 'residual',
      inputs: {
        gdv: 30_000_000,
        constructionCost: 12_000_000,
        profit: 0.15,
        finance: 0.06,
        softCosts: 0.08,
        contingency: 0.04,
      },
    });
    assert.ok(r.likely > 0);
    const notes = r.notes.map((n) => n.he).join('|');
    assert.ok(/תמ"א|פיתוח/.test(notes));
  });
});
