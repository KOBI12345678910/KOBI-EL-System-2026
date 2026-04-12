/**
 * Unit tests for purchase-tax — מחשבון מס רכישה
 * Agent Y-008 — written 2026-04-11
 *
 * Run:   node --test test/tax/purchase-tax.test.js
 *
 * Coverage:
 *   - getBrackets() — year lookup, fallback, full-table dump
 *   - computePurchaseTax() — residential primary across all 5 brackets
 *   - residential investment brackets (8% / 10%)
 *   - oleh discounted brackets (§12 window)
 *   - oleh outside window → falls back to primary
 *   - commercial / land / agricultural flat rates
 *   - buyer status disambiguation (individual / company / foreign)
 *   - primary residence vs investment distinction
 *   - bracket-boundary math (edge cases at each threshold)
 *   - disabled / bereaved relief (§11)
 *   - computeOlehDiscount() standalone helper
 *   - zero / negative / invalid price
 *   - historical year 2025
 *
 * Principle: lo mochkim — rak mesaddreggim (never delete, only grow).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computePurchaseTax,
  computeOlehDiscount,
  getBrackets,
  listSupportedYears,
  applyBrackets,
  resolveBuyerType,
  PROPERTY_TYPES,
  BUYER_STATUS,
  BRACKETS_BY_YEAR,
} = require('../../src/tax/purchase-tax.js');

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Small numeric tolerance for floating-point slices. */
function close(a, b, eps = 0.5) {
  return Math.abs(a - b) <= eps;
}

// ──────────────────────────────────────────────────────────────
// 1. getBrackets() + listSupportedYears()
// ──────────────────────────────────────────────────────────────

test('01. getBrackets(2026) returns full table keyed by buyer type', () => {
  const table = getBrackets(2026);
  assert.ok(table.residential_primary);
  assert.ok(table.residential_investment);
  assert.ok(table.residential_oleh);
  assert.ok(table.commercial);
  assert.ok(table.land);
  assert.ok(table.agricultural);
});

test('02. getBrackets(2026, "residential_primary") has 5 brackets', () => {
  const b = getBrackets(2026, 'residential_primary');
  assert.equal(b.length, 5);
  assert.equal(b[0].rate, 0);
  assert.equal(b[1].rate, 0.035);
  assert.equal(b[2].rate, 0.05);
  assert.equal(b[3].rate, 0.08);
  assert.equal(b[4].rate, 0.10);
});

test('03. getBrackets(2026, "residential_investment") has 2 brackets (8%, 10%)', () => {
  const b = getBrackets(2026, 'residential_investment');
  assert.equal(b.length, 2);
  assert.equal(b[0].rate, 0.08);
  assert.equal(b[1].rate, 0.10);
});

test('04. getBrackets() unknown future year falls back to most recent known', () => {
  const b = getBrackets(2099, 'residential_primary');
  assert.equal(b.length, 5);
  assert.equal(b[0].rate, 0); // 2026 structure
});

test('05. getBrackets(2025) has 2025 primary-residence brackets (historical)', () => {
  const b = getBrackets(2025, 'residential_primary');
  assert.equal(b.length, 5);
  assert.equal(b[0].to, 1919155); // 2025 threshold — preserved
});

test('06. listSupportedYears() is sorted ascending', () => {
  const years = listSupportedYears();
  assert.ok(years.length >= 2);
  const sorted = [...years].sort((a, b) => a - b);
  assert.deepEqual(years, sorted);
});

test('07. BRACKETS_BY_YEAR is frozen (no mutation allowed)', () => {
  assert.ok(Object.isFrozen(BRACKETS_BY_YEAR));
  assert.ok(Object.isFrozen(BRACKETS_BY_YEAR[2026]));
});

// ──────────────────────────────────────────────────────────────
// 2. Primary-residence brackets — boundary math
// ──────────────────────────────────────────────────────────────

test('10. Primary residence at 1,500,000 → 0% (below first threshold)', () => {
  const r = computePurchaseTax({
    price: 1500000,
    propertyType: PROPERTY_TYPES.RESIDENTIAL,
    buyerStatus: BUYER_STATUS.INDIVIDUAL,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.tax, 0);
  assert.equal(r.effective_rate, 0);
  assert.equal(r.form, '7002');
});

test('11. Primary residence at 1,978,745 (exactly boundary) → still 0%', () => {
  const r = computePurchaseTax({
    price: 1978745,
    propertyType: PROPERTY_TYPES.RESIDENTIAL,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.tax, 0);
});

test('12. Primary residence at 2,000,000 → tax on 21,255 × 3.5%', () => {
  const r = computePurchaseTax({
    price: 2000000,
    propertyType: PROPERTY_TYPES.RESIDENTIAL,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const expected = (2000000 - 1978745) * 0.035;
  assert.ok(close(r.tax, expected), `got ${r.tax} expected ~${expected}`);
});

test('13. Primary residence at 2,347,040 (second boundary) — only 3.5% bracket applies', () => {
  const r = computePurchaseTax({
    price: 2347040,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const expected = (2347040 - 1978745) * 0.035;
  assert.ok(close(r.tax, expected));
});

test('14. Primary residence at 3,000,000 → progressive 0% + 3.5% + 5%', () => {
  const r = computePurchaseTax({
    price: 3000000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const expected =
    (2347040 - 1978745) * 0.035 +
    (3000000 - 2347040) * 0.05;
  assert.ok(close(r.tax, expected));
  assert.equal(r.brackets.length, 3); // 0%, 3.5%, 5%
});

test('15. Primary residence at 6,055,070 (third boundary) — exactly top of 5% bracket', () => {
  const r = computePurchaseTax({
    price: 6055070,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const expected =
    (2347040 - 1978745) * 0.035 +
    (6055070 - 2347040) * 0.05;
  assert.ok(close(r.tax, expected));
});

test('16. Primary residence at 10,000,000 → 8% bracket engaged', () => {
  const r = computePurchaseTax({
    price: 10000000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const expected =
    (2347040 - 1978745) * 0.035 +
    (6055070 - 2347040) * 0.05 +
    (10000000 - 6055070) * 0.08;
  assert.ok(close(r.tax, expected));
  assert.equal(r.brackets.length, 4);
});

test('17. Primary residence at 25,000,000 → top 10% bracket engaged', () => {
  const r = computePurchaseTax({
    price: 25000000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const expected =
    (2347040 - 1978745) * 0.035 +
    (6055070 - 2347040) * 0.05 +
    (20183565 - 6055070) * 0.08 +
    (25000000 - 20183565) * 0.10;
  assert.ok(close(r.tax, expected));
  assert.equal(r.brackets.length, 5); // all five brackets touched
});

// ──────────────────────────────────────────────────────────────
// 3. Investment / second-home brackets
// ──────────────────────────────────────────────────────────────

test('20. Investment at 3,000,000 → 8% flat up to threshold', () => {
  const r = computePurchaseTax({
    price: 3000000,
    propertyType: PROPERTY_TYPES.RESIDENTIAL,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.tax, 240000);
  assert.equal(r.effective_rate, 0.08);
  assert.equal(r.meta.buyer_type, 'residential_investment');
});

test('21. Investment at 6,055,070 (boundary) → all at 8%', () => {
  const r = computePurchaseTax({
    price: 6055070,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  assert.ok(close(r.tax, 6055070 * 0.08));
});

test('22. Investment at 10,000,000 → progressive 8% + 10%', () => {
  const r = computePurchaseTax({
    price: 10000000,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  const expected = 6055070 * 0.08 + (10000000 - 6055070) * 0.10;
  assert.ok(close(r.tax, expected));
  assert.equal(r.brackets.length, 2);
});

test('23. Primary residence vs investment @ same 3M NIS — investment is much higher', () => {
  const primary = computePurchaseTax({
    price: 3000000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const investment = computePurchaseTax({
    price: 3000000,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  assert.ok(investment.tax > primary.tax * 5);
  assert.equal(primary.form, '7002');
  assert.equal(investment.form, '7000');
});

// ──────────────────────────────────────────────────────────────
// 4. Oleh discount
// ──────────────────────────────────────────────────────────────

test('30. Oleh within window → discounted rate at 2,000,000 NIS', () => {
  const r = computePurchaseTax({
    price: 2000000,
    propertyType: PROPERTY_TYPES.RESIDENTIAL,
    buyerStatus: BUYER_STATUS.OLEH,
    isPrimaryResidence: true,
    olehImmigrationDate: '2024-01-01',
    purchaseDate: '2026-06-01',
  });
  // 0.5% on first 1,988,090 + 5% on the slice above
  const expected = 1988090 * 0.005 + (2000000 - 1988090) * 0.05;
  assert.ok(close(r.tax, expected), `got ${r.tax} expected ~${expected}`);
  assert.equal(r.meta.buyer_type, 'residential_oleh');
});

test('31. Oleh outside 7-year window → falls back to regular', () => {
  const r = computePurchaseTax({
    price: 2000000,
    buyerStatus: BUYER_STATUS.OLEH,
    isPrimaryResidence: true,
    olehImmigrationDate: '2015-01-01', // 11 years pre-purchase → outside
    purchaseDate: '2026-06-01',
  });
  assert.notEqual(r.meta.buyer_type, 'residential_oleh');
  assert.equal(r.meta.buyer_type, 'residential_primary');
});

test('32. Oleh eligible from 12 months BEFORE aliyah', () => {
  const r = computePurchaseTax({
    price: 2000000,
    buyerStatus: BUYER_STATUS.OLEH,
    olehImmigrationDate: '2026-12-01',
    purchaseDate: '2026-06-01', // purchase 6 months before aliyah
  });
  assert.equal(r.meta.buyer_type, 'residential_oleh');
});

test('33. computeOlehDiscount() standalone — eligible case', () => {
  const r = computeOlehDiscount(3000000, '2024-01-01', '2026-06-01');
  assert.equal(r.eligible, true);
  // Optimal path picks the cheaper table (primary at 3M NIS).
  assert.ok(r.tax <= r.oleh_tax);
  assert.ok(r.tax <= r.standard_tax);
  assert.ok(r.tax <= r.investor_tax);
  assert.ok(r.discount_vs_investor > 0, 'should save a lot vs. investor brackets');
});

test('34. computeOlehDiscount() standalone — outside window', () => {
  const r = computeOlehDiscount(3000000, '2010-01-01', '2026-06-01');
  assert.equal(r.eligible, false);
  assert.equal(r.discount, 0);
  assert.equal(r.tax, r.standard_tax);
  assert.equal(r.window.months_since_aliyah, 16 * 12 + 5);
});

test('35. Oleh discount saves significant money vs investor brackets at 5M NIS', () => {
  const oleh = computeOlehDiscount(5000000, '2024-01-01', '2026-06-01');
  assert.ok(oleh.eligible);
  // Main value of oleh status: big saving vs the INVESTOR table.
  assert.ok(oleh.discount_vs_investor > 100000,
    `expected >100k NIS saving vs investor, got ${oleh.discount_vs_investor}`);
  assert.ok(oleh.tax <= oleh.investor_tax);
});

// ──────────────────────────────────────────────────────────────
// 5. Commercial / land / agricultural
// ──────────────────────────────────────────────────────────────

test('40. Commercial property → flat 6% regardless of price', () => {
  const r = computePurchaseTax({
    price: 5000000,
    propertyType: PROPERTY_TYPES.COMMERCIAL,
    buyerStatus: BUYER_STATUS.COMPANY,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.tax, 300000);
  assert.equal(r.effective_rate, 0.06);
  assert.equal(r.meta.buyer_type, 'commercial');
});

test('41. Land → flat 6%', () => {
  const r = computePurchaseTax({
    price: 1000000,
    propertyType: PROPERTY_TYPES.LAND,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.tax, 60000);
  assert.equal(r.effective_rate, 0.06);
});

test('42. Agricultural land → 5%', () => {
  const r = computePurchaseTax({
    price: 2000000,
    propertyType: PROPERTY_TYPES.AGRICULTURAL,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.tax, 100000);
  assert.equal(r.effective_rate, 0.05);
});

// ──────────────────────────────────────────────────────────────
// 6. Buyer status disambiguation
// ──────────────────────────────────────────────────────────────

test('50. Foreign buyer → always investor brackets', () => {
  const r = computePurchaseTax({
    price: 3000000,
    buyerStatus: BUYER_STATUS.FOREIGN,
    isPrimaryResidence: true,   // ignored for foreign
    buyerCountry: 'US',
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.meta.buyer_type, 'residential_investment');
  assert.equal(r.tax, 240000);
});

test('51. Company buyer → investor brackets', () => {
  const r = computePurchaseTax({
    price: 2500000,
    buyerStatus: BUYER_STATUS.COMPANY,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.meta.buyer_type, 'residential_investment');
  assert.equal(r.tax, 200000);
});

test('52. Israeli buyerCountry "IL" does NOT trigger foreign path', () => {
  const r = computePurchaseTax({
    price: 2500000,
    buyerStatus: BUYER_STATUS.INDIVIDUAL,
    isPrimaryResidence: true,
    buyerCountry: 'IL',
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.meta.buyer_type, 'residential_primary');
});

// ──────────────────────────────────────────────────────────────
// 7. Reliefs (§11 — disabled / bereaved)
// ──────────────────────────────────────────────────────────────

test('60. Disabled buyer gets ⅓ reduction (capped)', () => {
  const base = computePurchaseTax({
    price: 3000000,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  const relief = computePurchaseTax({
    price: 3000000,
    buyerStatus: BUYER_STATUS.DISABLED,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  assert.ok(relief.tax < base.tax);
  assert.ok(relief.exemptions.length >= 1);
  assert.equal(relief.exemptions[0].code, 'DISABLED_INDIVIDUAL');
});

test('61. Bereaved family relief applied', () => {
  const r = computePurchaseTax({
    price: 2500000,
    buyerStatus: BUYER_STATUS.BEREAVED,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  assert.ok(r.exemptions.length >= 1);
  assert.equal(r.exemptions[0].code, 'BEREAVED_FAMILY');
  assert.ok(r.exemptions[0].amount > 0);
});

// ──────────────────────────────────────────────────────────────
// 8. Bilingual output & form codes
// ──────────────────────────────────────────────────────────────

test('70. Result carries Hebrew and English reason strings', () => {
  const r = computePurchaseTax({
    price: 3000000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  assert.ok(r.meta.reason_he && r.meta.reason_he.length > 0);
  assert.ok(r.meta.reason_en && r.meta.reason_en.length > 0);
  // each applied bracket has Hebrew and English descriptors
  for (const b of r.brackets) {
    assert.ok(b.he && typeof b.he === 'string');
    assert.ok(b.en && typeof b.en === 'string');
  }
});

test('71. Form code 7002 for primary, 7000 for generic', () => {
  const primary = computePurchaseTax({ price: 3000000, isPrimaryResidence: true, purchaseDate: '2026-06-01' });
  const invest = computePurchaseTax({ price: 3000000, isInvestment: true, purchaseDate: '2026-06-01' });
  assert.equal(primary.form, '7002');
  assert.equal(invest.form, '7000');
});

test('72. Meta includes CPI note and Hebrew rule string', () => {
  const r = computePurchaseTax({ price: 3000000, isPrimaryResidence: true, purchaseDate: '2026-06-01' });
  assert.ok(r.meta.cpi_note.includes('118.4') || r.meta.cpi_note.includes('מדד'));
  assert.equal(r.meta.rule, 'לא מוחקים רק משדרגים ומגדלים');
});

// ──────────────────────────────────────────────────────────────
// 9. Edge cases / defensive paths
// ──────────────────────────────────────────────────────────────

test('80. Zero price → zero tax, empty brackets', () => {
  const r = computePurchaseTax({ price: 0, isPrimaryResidence: true, purchaseDate: '2026-06-01' });
  assert.equal(r.tax, 0);
  assert.equal(r.brackets.length, 0);
});

test('81. Negative price → zero tax', () => {
  const r = computePurchaseTax({ price: -100000, isPrimaryResidence: true });
  assert.equal(r.tax, 0);
});

test('82. Missing input object → still returns well-formed result', () => {
  const r = computePurchaseTax();
  assert.equal(r.tax, 0);
  assert.ok(r.meta);
  assert.ok(Array.isArray(r.brackets));
});

test('83. Invalid string price gracefully resolves to 0', () => {
  const r = computePurchaseTax({ price: 'abc', isPrimaryResidence: true });
  assert.equal(r.tax, 0);
});

// ──────────────────────────────────────────────────────────────
// 10. Historical year (2025) — preserved per "never delete" rule
// ──────────────────────────────────────────────────────────────

test('90. 2025 primary-residence brackets produce different result than 2026', () => {
  const r2026 = computePurchaseTax({
    price: 2000000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const r2025 = computePurchaseTax({
    price: 2000000,
    isPrimaryResidence: true,
    purchaseDate: '2025-06-01',
  });
  assert.notEqual(r2026.tax, r2025.tax);
  assert.equal(r2025.meta.year, 2025);
});

test('91. 2025 brackets preserved in BRACKETS_BY_YEAR (never deleted)', () => {
  assert.ok(BRACKETS_BY_YEAR[2025]);
  assert.ok(BRACKETS_BY_YEAR[2026]);
});

// ──────────────────────────────────────────────────────────────
// 11. Low-level helpers
// ──────────────────────────────────────────────────────────────

test('100. applyBrackets() on empty array returns zeros', () => {
  const r = applyBrackets(1000000, []);
  assert.equal(r.total, 0);
  assert.equal(r.applied.length, 0);
});

test('101. resolveBuyerType() — primary flag wins over default', () => {
  const bt = resolveBuyerType({
    propertyType: 'residential',
    buyerStatus: 'individual',
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  assert.equal(bt.key, 'residential_primary');
});

test('102. resolveBuyerType() — investment flag takes precedence over primary', () => {
  const bt = resolveBuyerType({
    propertyType: 'residential',
    isPrimaryResidence: true,
    isInvestment: true,
    purchaseDate: '2026-06-01',
  });
  assert.equal(bt.key, 'residential_investment');
});

test('103. resolveBuyerType() — commercial overrides everything', () => {
  const bt = resolveBuyerType({
    propertyType: 'commercial',
    buyerStatus: 'oleh',
    isPrimaryResidence: true,
    olehImmigrationDate: '2025-01-01',
    purchaseDate: '2026-06-01',
  });
  assert.equal(bt.key, 'commercial');
});

// ──────────────────────────────────────────────────────────────
// 12. Breakdown fields
// ──────────────────────────────────────────────────────────────

test('110. Breakdown exposes price / gross_tax / reliefs / net_tax', () => {
  const r = computePurchaseTax({
    price: 3000000,
    buyerStatus: BUYER_STATUS.DISABLED,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  assert.equal(r.breakdown.price, 3000000);
  assert.equal(r.breakdown.currency, 'ILS');
  assert.ok(r.breakdown.gross_tax >= r.breakdown.net_tax);
  assert.ok(r.breakdown.reliefs >= 0);
});

test('111. Sum of bracket tax slices equals gross tax (consistency check)', () => {
  const r = computePurchaseTax({
    price: 7500000,
    isPrimaryResidence: true,
    purchaseDate: '2026-06-01',
  });
  const sumSlices = r.brackets.reduce((s, b) => s + b.tax, 0);
  assert.ok(close(sumSlices, r.breakdown.gross_tax, 1));
});
