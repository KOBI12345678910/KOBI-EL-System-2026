/**
 * Unit tests for src/tax/betterment-tax.js
 * Run with: node --test test/tax/betterment-tax.test.js
 *
 * Coverage:
 *   • Linear method boundary — 01/01/2014 split (תיקון 76)
 *   • Primary residence exemption — 49ב(2)
 *   • Four-year cool-down — 49ב(1)
 *   • Improvements indexing — CPI adjustment per השבחה
 *   • Nominal / real betterment arithmetic
 *   • Form מש"ח field map
 *   • Full company sale (23% rate)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const bt = require('../../src/tax/betterment-tax.js');
const {
  computeBettermentTax,
  checkExemption,
  linearSplit,
  indexByCpi,
  buildForm7000Fields,
  TAX_RATES,
  KEY_DATES,
  LAW_CITATIONS,
  EXEMPTION_CEILINGS_2026,
  _internals,
} = bt;

// ═══════════════════════════════════════════════════════════════
// Fixture: toy CPI table (ILS, base 100 = 2000-01)
//   Rising ~2% / year — deterministic so tests are stable.
// ═══════════════════════════════════════════════════════════════
const CPI_TABLE = (() => {
  const monthly = {};
  let idx = 100.0;
  for (let yr = 2000; yr <= 2030; yr++) {
    for (let mo = 1; mo <= 12; mo++) {
      const key = `${yr}-${String(mo).padStart(2, '0')}`;
      monthly[key] = Math.round(idx * 10000) / 10000;
      idx *= 1.0015; // ~1.8% / year compounded monthly
    }
  }
  return { monthly, base: 100 };
})();

// ═══════════════════════════════════════════════════════════════
// Constants & helpers sanity
// ═══════════════════════════════════════════════════════════════

describe('constants', () => {
  test('KEY_DATES.LINEAR_BOUND is 2014-01-01', () => {
    assert.equal(KEY_DATES.LINEAR_BOUND, '2014-01-01');
  });

  test('TAX_RATES.INDIVIDUAL_GENERAL is 25%', () => {
    assert.equal(TAX_RATES.INDIVIDUAL_GENERAL, 0.25);
  });

  test('TAX_RATES.COMPANY_GENERAL is 23%', () => {
    assert.equal(TAX_RATES.COMPANY_GENERAL, 0.23);
  });

  test('EXEMPTION_CEILINGS_2026 defined', () => {
    assert.ok(EXEMPTION_CEILINGS_2026.SINGLE_RESIDENCE > 0);
  });

  test('LAW_CITATIONS contain bilingual labels', () => {
    assert.ok(LAW_CITATIONS.SECTION_49B2.he.includes('49ב(2)'));
    assert.ok(LAW_CITATIONS.SECTION_49B2.en.includes('Single-residence'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Helpers: date parsing, daysBetween, CPI indexing
// ═══════════════════════════════════════════════════════════════

describe('internal helpers', () => {
  test('parseDate accepts YYYY-MM-DD', () => {
    const d = _internals.parseDate('2014-01-01');
    assert.equal(d.getUTCFullYear(), 2014);
    assert.equal(d.getUTCMonth(), 0);
    assert.equal(d.getUTCDate(), 1);
  });

  test('parseDate rejects invalid strings', () => {
    assert.throws(() => _internals.parseDate('bogus'));
    assert.throws(() => _internals.parseDate('2014-13-01'));
  });

  test('daysBetween 2014-01-01 → 2014-12-31 = 364', () => {
    assert.equal(_internals.daysBetween('2014-01-01', '2014-12-31'), 364);
  });

  test('daysBetween is order-sensitive (negative for reversed)', () => {
    assert.ok(_internals.daysBetween('2014-12-31', '2014-01-01') < 0);
  });

  test('indexByCpi applies monotonic CPI factor', () => {
    const res = indexByCpi(1_000_000, '2010-01-01', '2020-01-01', CPI_TABLE);
    assert.ok(res.adjusted > 1_000_000, 'CPI grew so adjusted > nominal');
    assert.ok(res.factor > 1);
  });

  test('indexByCpi returns factor 1 when no CPI table', () => {
    const res = indexByCpi(100_000, '2010-01-01', '2020-01-01');
    assert.equal(res.adjusted, 100_000);
    assert.equal(res.factor, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Linear method — 2014 boundary split
// ═══════════════════════════════════════════════════════════════

describe('linearSplit — 01/01/2014 boundary', () => {
  test('sale entirely before 2014-01-01 → single pre-2014 segment', () => {
    const res = linearSplit({
      purchaseDate: '2005-06-15',
      saleDate: '2013-06-15',
      realBetterment: 1_000_000,
      sellerStatus: 'individual',
      isPrimaryResidence: false,
    });
    // Expect segments up to the pre-2014 bound only (no post-2014 slice).
    const post = res.periods.find((p) => p.label === 'post-2014');
    assert.ok(post);
    assert.equal(post.days, 0, 'post-2014 segment exists but with 0 days');
  });

  test('sale entirely after 2014-01-01 → single post-2014 segment', () => {
    const res = linearSplit({
      purchaseDate: '2015-01-01',
      saleDate: '2025-01-01',
      realBetterment: 1_000_000,
      sellerStatus: 'individual',
      isPrimaryResidence: false,
    });
    const post = res.periods.find((p) => p.label === 'post-2014');
    assert.equal(post.share, 1);
    assert.equal(res.totalTax, 250_000); // 25% of 1M
  });

  test('straddles 2014 boundary — linear-exempt zeros out pre-2014 gain', () => {
    // Purchase in 2009, sale in 2019, half before / half after the boundary.
    const res = linearSplit({
      purchaseDate: '2009-01-01',
      saleDate: '2019-01-01',
      realBetterment: 1_000_000,
      sellerStatus: 'individual',
      isPrimaryResidence: true,
      linearExempt: true,
    });
    const pre = res.periods.find((p) => p.label === 'pre-2014');
    const post = res.periods.find((p) => p.label === 'post-2014');
    assert.equal(pre.rate, 0, 'pre-2014 rate is 0 when linearExempt');
    assert.equal(post.rate, 0.25);
    // Pre-2014 share ≈ 5/10 = 0.5
    assert.ok(Math.abs(pre.share - 0.5) < 0.01, `expected pre-2014 share near 0.5, got ${pre.share}`);
    // Tax ≈ 0.5 * 1M * 0.25 = 125_000 (only on post-2014)
    assert.ok(Math.abs(res.totalTax - 125_000) < 500,
      `expected tax near 125k, got ${res.totalTax}`);
  });

  test('straddles 2014 boundary — non-exempt applies 25% on both sides', () => {
    const res = linearSplit({
      purchaseDate: '2009-01-01',
      saleDate: '2019-01-01',
      realBetterment: 1_000_000,
      sellerStatus: 'individual',
      isPrimaryResidence: false,
      linearExempt: false,
    });
    const pre = res.periods.find((p) => p.label === 'pre-2014');
    assert.equal(pre.rate, 0.25);
    assert.ok(Math.abs(res.totalTax - 250_000) < 500, `expected near 250k, got ${res.totalTax}`);
  });

  test('company seller always uses 23% regardless of boundary', () => {
    const res = linearSplit({
      purchaseDate: '2009-01-01',
      saleDate: '2019-01-01',
      realBetterment: 1_000_000,
      sellerStatus: 'company',
      isPrimaryResidence: false,
    });
    for (const p of res.periods) {
      assert.equal(p.rate, TAX_RATES.COMPANY_GENERAL);
    }
  });

  test('totalDays equals daysBetween(purchase, sale)', () => {
    const res = linearSplit({
      purchaseDate: '2010-01-01',
      saleDate: '2020-01-01',
      realBetterment: 500_000,
      sellerStatus: 'individual',
    });
    assert.equal(res.totalDays, _internals.daysBetween('2010-01-01', '2020-01-01'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Primary residence exemption — 49ב(2)
// ═══════════════════════════════════════════════════════════════

describe('checkExemption — primary residence (49ב(2))', () => {
  test('eligible when single residence and price under ceiling', () => {
    const res = checkExemption({
      propertyType: 'apartment',
      isPrimaryResidence: true,
    });
    const found = res.eligible.find((e) => e.key === 'SECTION_49B2');
    assert.ok(found, 'should list SECTION_49B2');
    assert.equal(found.citation.he, LAW_CITATIONS.SECTION_49B2.he);
  });

  test('blocked when prior residence sold within 18 months', () => {
    const res = checkExemption({
      propertyType: 'apartment',
      isPrimaryResidence: true,
      soldPriorResidenceWithin18m: true,
    });
    const blocked = res.blocked.find((b) => b.key === 'SECTION_49B2');
    assert.ok(blocked);
    assert.ok(blocked.reason_he.includes('18 חודשים'));
  });

  test('not eligible when property is not residential', () => {
    const res = checkExemption({
      propertyType: 'commercial',
      isPrimaryResidence: true,
    });
    const found = res.eligible.find((e) => e.key === 'SECTION_49B2');
    assert.ok(!found);
  });

  test('computeBettermentTax applies full exemption when price ≤ ceiling', () => {
    const calc = computeBettermentTax({
      purchase: 1_500_000,
      sale: 2_500_000,
      purchaseDate: '2010-01-01',
      saleDate: '2024-06-01',
      improvements: [],
      expenses: 50_000,
      propertyType: 'apartment',
      isPrimaryResidence: true,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    assert.equal(calc.totalTax, 0);
    assert.equal(calc.bestMethod.method, 'full-exempt');
    assert.ok(calc.exemptions.eligible.some((e) => e.key === 'SECTION_49B2'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Four-year cool-down — 49ב(1)
// ═══════════════════════════════════════════════════════════════

describe('checkExemption — four-year cool-down (49ב(1))', () => {
  test('blocked when another residence was sold within 4 years', () => {
    const res = checkExemption({
      propertyType: 'apartment',
      isPrimaryResidence: false,
      soldPriorResidenceWithin4y: true,
    });
    const blocked = res.blocked.find((b) => b.key === 'SECTION_49B1');
    assert.ok(blocked, 'should be in blocked list');
    assert.ok(blocked.reason_he.includes('צינון'));
  });

  test('eligible when no residence sold in the last 4 years (secondary property)', () => {
    const res = checkExemption({
      propertyType: 'apartment',
      isPrimaryResidence: false,
      soldPriorResidenceWithin4y: false,
    });
    const found = res.eligible.find((e) => e.key === 'SECTION_49B1');
    assert.ok(found);
    assert.ok(found.conditions_he.some((c) => c.includes('4 השנים')));
  });

  test('cool-down exemption surfaces in full tax calculation', () => {
    const calc = computeBettermentTax({
      purchase: 2_000_000,
      sale: 3_500_000,
      purchaseDate: '2005-01-01',
      saleDate: '2024-01-01',
      improvements: [],
      expenses: 0,
      propertyType: 'apartment',
      isPrimaryResidence: false,
      soldPriorResidenceWithin4y: false,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    const cool = calc.exemptions.eligible.find((e) => e.key === 'SECTION_49B1');
    assert.ok(cool);
  });
});

// ═══════════════════════════════════════════════════════════════
// Improvements indexing
// ═══════════════════════════════════════════════════════════════

describe('improvements indexing', () => {
  test('each improvement is indexed to the sale date', () => {
    const calc = computeBettermentTax({
      purchase: 1_500_000,
      sale: 3_000_000,
      purchaseDate: '2010-01-01',
      saleDate: '2024-01-01',
      improvements: [
        { amount: 100_000, date: '2012-05-01', description: 'שיפוץ מטבח' },
        { amount: 50_000, date: '2018-03-15', description: 'חלונות' },
      ],
      expenses: 0,
      propertyType: 'apartment',
      isPrimaryResidence: false,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    assert.equal(calc.improvements.length, 2);
    for (const imp of calc.improvements) {
      assert.ok(imp.adjusted >= imp.nominal, 'adjusted ≥ nominal (CPI grew)');
      assert.ok(imp.factor >= 1);
    }
    // The older improvement should have a larger factor than the newer one.
    assert.ok(calc.improvements[0].factor > calc.improvements[1].factor);
  });

  test('improvements reduce both nominal and real betterment', () => {
    const withoutImp = computeBettermentTax({
      purchase: 1_000_000,
      sale: 2_000_000,
      purchaseDate: '2010-01-01',
      saleDate: '2024-01-01',
      improvements: [],
      expenses: 0,
      propertyType: 'commercial',
      isPrimaryResidence: false,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    const withImp = computeBettermentTax({
      purchase: 1_000_000,
      sale: 2_000_000,
      purchaseDate: '2010-01-01',
      saleDate: '2024-01-01',
      improvements: [{ amount: 200_000, date: '2015-01-01' }],
      expenses: 0,
      propertyType: 'commercial',
      isPrimaryResidence: false,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    assert.ok(withImp.betterment.nominal < withoutImp.betterment.nominal);
    assert.ok(withImp.betterment.real < withoutImp.betterment.real);
    assert.ok(withImp.totalTax < withoutImp.totalTax);
  });

  test('nominal formula: sale − purchase − improvements − expenses', () => {
    const calc = computeBettermentTax({
      purchase: 1_000_000,
      sale: 2_500_000,
      purchaseDate: '2010-01-01',
      saleDate: '2024-01-01',
      improvements: [{ amount: 200_000, date: '2015-01-01' }],
      expenses: 50_000,
      propertyType: 'commercial',
      isPrimaryResidence: false,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    // 2_500_000 − 1_000_000 − 200_000 − 50_000 = 1_250_000
    assert.equal(calc.betterment.nominal, 1_250_000);
  });
});

// ═══════════════════════════════════════════════════════════════
// Company sale (23%)
// ═══════════════════════════════════════════════════════════════

describe('company seller', () => {
  test('applies 23% corporate rate', () => {
    const calc = computeBettermentTax({
      purchase: 5_000_000,
      sale: 10_000_000,
      purchaseDate: '2015-01-01',
      saleDate: '2025-01-01',
      improvements: [],
      expenses: 0,
      propertyType: 'commercial',
      isPrimaryResidence: false,
      sellerStatus: 'company',
      cpiTable: CPI_TABLE,
    });
    assert.equal(calc.regular.rate, TAX_RATES.COMPANY_GENERAL);
  });
});

// ═══════════════════════════════════════════════════════════════
// Form מש"ח field builder
// ═══════════════════════════════════════════════════════════════

describe('Form 7000 / מש"ח field builder', () => {
  test('produces the blocks expected by רשות המסים', () => {
    const calc = computeBettermentTax({
      purchase: 1_500_000,
      sale: 2_800_000,
      purchaseDate: '2008-01-01',
      saleDate: '2024-01-01',
      improvements: [{ amount: 80_000, date: '2012-01-01', description: 'שיפוץ' }],
      expenses: 30_000,
      propertyType: 'apartment',
      isPrimaryResidence: true,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    const f = calc.form7000Fields;
    assert.ok(f.property);
    assert.ok(f.transaction);
    assert.ok(f.betterment);
    assert.ok(f.assessment);
    assert.ok(f.exemptionDeclaration);
    assert.equal(f.transaction.salePrice, 2_800_000);
    assert.equal(f.transaction.purchasePrice, 1_500_000);
    assert.equal(typeof f.betterment.field_17_realBetterment, 'number');
  });

  test('exemption declaration recorded when claimed', () => {
    const calc = computeBettermentTax({
      purchase: 1_500_000,
      sale: 2_500_000,
      purchaseDate: '2010-01-01',
      saleDate: '2024-01-01',
      improvements: [],
      expenses: 0,
      propertyType: 'apartment',
      isPrimaryResidence: true,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });
    assert.equal(calc.form7000Fields.exemptionDeclaration.claimedExemption, 'SECTION_49B2');
  });
});

// ═══════════════════════════════════════════════════════════════
// Error handling / input validation
// ═══════════════════════════════════════════════════════════════

describe('error handling', () => {
  test('rejects non-positive purchase', () => {
    assert.throws(() => computeBettermentTax({
      purchase: 0, sale: 1000, purchaseDate: '2010-01-01', saleDate: '2020-01-01',
    }));
  });

  test('rejects sale before purchase', () => {
    assert.throws(() => computeBettermentTax({
      purchase: 100, sale: 200, purchaseDate: '2020-01-01', saleDate: '2010-01-01',
    }));
  });

  test('rejects missing dates', () => {
    assert.throws(() => computeBettermentTax({
      purchase: 100, sale: 200,
    }));
  });
});

// ═══════════════════════════════════════════════════════════════
// Integration smoke — full path
// ═══════════════════════════════════════════════════════════════

describe('integration — full sale path', () => {
  test('returns a full structured breakdown with all expected keys', () => {
    const calc = computeBettermentTax({
      purchase: 1_000_000,
      sale: 3_000_000,
      purchaseDate: '2008-06-01',
      saleDate: '2024-06-01',
      improvements: [
        { amount: 120_000, date: '2012-03-10', description: 'הרחבה' },
        { amount: 60_000, date: '2019-08-20', description: 'חלונות' },
      ],
      expenses: [
        { amount: 25_000, description: 'שכ"ט עו"ד' },
        { amount: 40_000, description: 'עמלת תיווך' },
      ],
      propertyType: 'apartment',
      isPrimaryResidence: false,
      sellerStatus: 'individual',
      cpiTable: CPI_TABLE,
    });

    assert.ok(calc.betterment);
    assert.ok(calc.linear);
    assert.ok(calc.exemptions);
    assert.ok(calc.bestMethod);
    assert.ok(Array.isArray(calc.candidates));
    assert.ok(calc.candidates.length >= 2);
    assert.ok(calc.form7000Fields);
    assert.ok(calc.meta.engine.includes('betterment-tax'));

    // Tax must be non-negative and <= nominal betterment
    assert.ok(calc.totalTax >= 0);
    assert.ok(calc.totalTax <= calc.betterment.nominal);
  });
});
