/**
 * form-1301.test.js — tests for טופס 1301 annual personal income tax return.
 * Agent AG-Y001 / Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Run with: node --test test/tax/form-1301.test.js
 *
 * Scope:
 *   • Bracket boundary math (10/14/20/31/35/47/50%)
 *   • Credit-point value (2,976 NIS × n)
 *   • Surtax threshold (698,280 NIS @ 3%)
 *   • Married / joint filing (separate computation summed)
 *   • Capital-gains flat 25% line
 *   • Refund case (negative balance = refund)
 *   • Exempt-income (רגילים ופטורים) handling
 *   • Deduction caps (pension, study fund, life, 30% donation cap)
 *   • Field map completeness (all 8 sections populated)
 *   • normalizeInput + computeProgressiveTax + computeSurtax + applyCreditPoints
 *   • renderPDF1301 text-stub dry run (pdfkit-free safe path)
 */

'use strict';

const assert = require('node:assert/strict');
const test   = require('node:test');

const form1301 = require('../../src/tax/form-1301');

const {
  generate1301,
  renderPDF1301,
  computeProgressiveTax,
  computeSurtax,
  applyCreditPoints,
  normalizeInput,
  CONSTANTS_2026_1301,
  TAX_BRACKETS_2026,
  CREDIT_POINT_VALUE,
  SURTAX_THRESHOLD,
  SURTAX_RATE,
  FIELD_MAP_1301,
} = form1301;

// A valid Israeli ID for fixtures (passes the mod-10 check).
const VALID_ID_1 = '123456782';
const VALID_ID_2 = '987654321';

// ---------------------------------------------------------------------------
// Constants sanity
// ---------------------------------------------------------------------------

test('constants: bracket ladder matches 10/14/20/31/35/47/50', () => {
  const rates = TAX_BRACKETS_2026.map((b) => b.rate);
  assert.deepEqual(rates, [0.10, 0.14, 0.20, 0.31, 0.35, 0.47, 0.50]);
  // Top bracket is Infinity
  assert.equal(TAX_BRACKETS_2026[TAX_BRACKETS_2026.length - 1].upTo, Infinity);
});

test('constants: credit-point value is 2,976 NIS', () => {
  assert.equal(CREDIT_POINT_VALUE, 2976);
  assert.equal(CONSTANTS_2026_1301.creditPointValue, 2976);
});

test('constants: surtax threshold is 698,280 NIS @ 3%', () => {
  assert.equal(SURTAX_THRESHOLD, 698280);
  assert.equal(SURTAX_RATE, 0.03);
});

// ---------------------------------------------------------------------------
// computeProgressiveTax — bracket boundary math
// ---------------------------------------------------------------------------

test('progressive: zero taxable income → zero tax', () => {
  const r = computeProgressiveTax(0);
  assert.equal(r.tax, 0);
  assert.equal(r.breakdown.length, 7);
});

test('progressive: exactly 84,120 → fully in 10% bracket', () => {
  const r = computeProgressiveTax(84120);
  assert.equal(r.tax, 8412); // 84120 × 0.10
});

test('progressive: 1 NIS past 84,120 → bucket-1 saturated, bucket-2 gets 1 NIS', () => {
  const r = computeProgressiveTax(84121);
  // 84120 × 0.10 + 1 × 0.14
  const expected = Math.round((8412 + 0.14 + Number.EPSILON) * 100) / 100;
  assert.equal(r.tax, expected);
  assert.equal(r.breakdown[0].taxed, 84120);
  assert.equal(r.breakdown[1].taxed, 1);
});

test('progressive: boundary 120,720 equals the first two buckets fully', () => {
  // 84120×.10 + (120720-84120)×.14 = 8412 + 5124 = 13536
  const r = computeProgressiveTax(120720);
  assert.equal(r.tax, 13536);
});

test('progressive: 200,000 spans 4 buckets', () => {
  // 84120×0.10 + (120720-84120)×0.14 + (193800-120720)×0.20 + (200000-193800)×0.31
  // = 8412 + 5124 + 14616 + 1922 = 30074
  const r = computeProgressiveTax(200000);
  assert.equal(r.tax, 30074);
});

test('progressive: 1,000,000 spans all 7 buckets', () => {
  const r = computeProgressiveTax(1000000);
  // 84120*.10=8412
  // (120720-84120)*.14=5124
  // (193800-120720)*.20=14616
  // (269280-193800)*.31=23398.8
  // (560280-269280)*.35=101850
  // (721560-560280)*.47=75801.6
  // (1000000-721560)*.50=139220
  // total 368422.4
  assert.equal(r.tax, 368422.4);
  assert.equal(r.breakdown[6].taxed, 1000000 - 721560);
});

// ---------------------------------------------------------------------------
// computeSurtax — 3% on income above 698,280
// ---------------------------------------------------------------------------

test('surtax: at threshold → zero', () => {
  const r = computeSurtax(698280);
  assert.equal(r.surtax, 0);
  assert.equal(r.excess, 0);
});

test('surtax: below threshold → zero', () => {
  assert.equal(computeSurtax(500000).surtax, 0);
});

test('surtax: 800,000 → 3% × 101,720 = 3,051.60', () => {
  const r = computeSurtax(800000);
  assert.equal(r.excess, 101720);
  assert.equal(r.surtax, 3051.6);
});

// ---------------------------------------------------------------------------
// applyCreditPoints — credit points reduction
// ---------------------------------------------------------------------------

test('credit points: 2.25 points × 2976 = 6,696 reduction', () => {
  const r = applyCreditPoints(10000, 2.25);
  assert.equal(r.reduction, 6696);
  assert.equal(r.tax, 3304);
});

test('credit points: never drive tax below zero', () => {
  const r = applyCreditPoints(1000, 5); // 5 × 2976 = 14880 >> 1000
  assert.equal(r.tax, 0);
});

// ---------------------------------------------------------------------------
// generate1301 — full happy-path smoke
// ---------------------------------------------------------------------------

test('generate1301: throws on missing taxpayer.id', () => {
  assert.throws(() => generate1301({}), /taxpayer\.id/);
});

test('generate1301: smoke — simple single filer', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'Yisrael Yisraeli', address: 'Herzl 1, TA', status: 'single' },
    income: {
      employment: { gross: 150000, exempt: 0, withholding: 20000 },
    },
    credits: { pointsPersonal: 2.25 },
    withholding: 20000,
  });

  assert.ok(result.computedTax > 0);
  assert.equal(result.credits.creditPoints, 2.25);
  assert.equal(result.credits.creditPointsValue, 2.25 * 2976);
  assert.ok(result.fields.section_01_taxpayer);
  assert.equal(result.fields.section_01_taxpayer.fields.tax_id.value, VALID_ID_1);
  assert.equal(result.meta.year, 2026);
});

// ---------------------------------------------------------------------------
// Married filing — joint computation (separate ladders summed)
// ---------------------------------------------------------------------------

test('married filing: spouse ladder computed separately and summed', () => {
  const primary = {
    taxpayer: { id: VALID_ID_1, name: 'A', status: 'married' },
    income: { employment: { gross: 100000, exempt: 0, withholding: 10000 } },
    credits: { pointsPersonal: 2.25 },
    withholding: 10000,
  };
  const withSpouse = Object.assign({}, primary, {
    spouse: {
      taxpayer: { id: VALID_ID_2, name: 'B' },
      income: { employment: { gross: 100000, exempt: 0, withholding: 10000 } },
      credits: { pointsPersonal: 2.75 },
      withholding: 10000,
    },
  });

  const soloA = generate1301(primary);
  const joint = generate1301(withSpouse);

  // Joint computedTax ≈ 2 × soloA.computedTax (same income shape)
  // Use computed tax pre-credits to compare, because credit points differ
  // slightly (2.25 vs 2.75).
  assert.ok(joint.computedTax > soloA.computedTax);

  // Joint credit-points total = 2.25 + 2.75 = 5.0
  assert.equal(joint.credits.creditPoints, 5.0);

  // Joint withholding = 20k; balance accounts for it
  assert.equal(joint.fields.section_07_reconciliation.fields.withholding.value, 20000);
});

// ---------------------------------------------------------------------------
// Capital gains flat line
// ---------------------------------------------------------------------------

test('capital gains: flat 25% line regardless of bracket', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'X' },
    income: {
      employment: { gross: 0 },
      capital: { gains: 100000 },
    },
  });

  // Bracket tax on zero non-capital income = 0
  // Capital tax = 100000 × 0.25 = 25000
  // Plus surtax? 100000 < 698280 → 0
  // No credit points provided → default 2.25 × 2976 = 6696
  // Net tax = 25000 - 6696 = 18304
  assert.equal(result.diagnostics.perFiler.self.capitalTax, 25000);
  assert.ok(result.credits.creditPointsValue > 0);
  assert.equal(result.netTax, 25000 - 2.25 * 2976);
});

// ---------------------------------------------------------------------------
// Refund case — withholding exceeds tax
// ---------------------------------------------------------------------------

test('refund case: withholding exceeds tax → negative balance', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'Z' },
    income: {
      employment: { gross: 100000, withholding: 50000 },
    },
    credits: { pointsPersonal: 2.25 },
    withholding: 50000,
  });

  // Gross bracket tax on 100k:
  //   84120*.10 = 8412
  //   (100000-84120)*.14 = 2223.2
  //   total 10635.2
  // Minus credit points 2.25*2976 = 6696 → net 3939.2
  // Withholding 50000 → balance = 3939.2 - 50000 = -46060.8 (refund)
  assert.ok(result.balance < 0);
  assert.equal(result.meta.refund, true);
  assert.ok(result.meta.refundOwed > 0);
  assert.equal(result.meta.balanceDue, 0);
});

// ---------------------------------------------------------------------------
// Exempt income — רגילים ופטורים
// ---------------------------------------------------------------------------

test('exempt income: pension exempt portion is removed from taxable', () => {
  const withExempt = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'E' },
    income: {
      employment: { gross: 100000 },
      pension:    { gross: 50000, exempt: 20000 },
    },
    credits: { pointsPersonal: 0 }, // disable points to isolate math
  });
  const noPension = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'E' },
    income: {
      employment: { gross: 100000 },
      pension:    { gross: 30000, exempt: 0 }, // same effective taxable: 30,000
    },
    credits: { pointsPersonal: 0 },
  });

  // After the exempt carve-out both filers have 130,000 taxable; tax equal.
  assert.equal(withExempt.computedTax, noPension.computedTax);
  assert.equal(
    withExempt.fields.section_03_exempt.fields.pension_exempt.value,
    20000,
  );
});

test('rental 10% track: taxed at flat 10%, not in bracket ladder', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'R' },
    income: {
      rental: { gross: 50000, expenses: 0, track: '10pct' },
    },
    credits: { pointsPersonal: 0 },
  });
  assert.equal(result.diagnostics.perFiler.self.rental10pctTax, 5000);
  // Exempt row populated
  assert.equal(
    result.fields.section_03_exempt.fields.rental_exempt_10pct.value,
    50000,
  );
});

// ---------------------------------------------------------------------------
// Surtax hits the 1301 output
// ---------------------------------------------------------------------------

test('surtax: 800k income triggers 3% surtax line in section 6', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'H' },
    income: { employment: { gross: 800000 } },
    credits: { pointsPersonal: 0 },
  });
  // 3% × (800000 - 698280) = 3 % × 101720 = 3051.6
  assert.equal(result.fields.section_06_computation.fields.surtax.value, 3051.6);

  // Bracket tax on 800k:
  //   84120*.10 + (120720-84120)*.14 + (193800-120720)*.20
  //   + (269280-193800)*.31 + (560280-269280)*.35 + (721560-560280)*.47
  //   + (800000-721560)*.50
  //   = 8412 + 5124 + 14616 + 23398.8 + 101850 + 75801.6 + 39220
  //   = 268422.4
  // Plus surtax 3051.6 → 271474.0
  assert.equal(result.fields.section_06_computation.fields.tax_by_brackets.value, 268422.4);
  assert.equal(result.computedTax, 271474);
});

// ---------------------------------------------------------------------------
// Deduction caps
// ---------------------------------------------------------------------------

test('deduction cap: donation capped at 30% of non-capital taxable', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'D' },
    income: { employment: { gross: 100000 } },
    deductions: { donation: 99999 },
    credits: { pointsPersonal: 0 },
  });
  // Cap = 100000 × 0.30 = 30000
  assert.equal(result.fields.section_04_deductions.fields.donation.value, 30000);
  assert.ok(result.diagnostics.deductionNotes.includes('donation_capped_30pct'));
});

// ---------------------------------------------------------------------------
// Field map completeness
// ---------------------------------------------------------------------------

test('field map: all 8 sections populated and decorated', () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'F' },
    income: { employment: { gross: 50000 } },
  });
  const sections = [
    'section_01_taxpayer',
    'section_02_income',
    'section_03_exempt',
    'section_04_deductions',
    'section_05_credits',
    'section_06_computation',
    'section_07_reconciliation',
    'section_08_signature',
  ];
  for (const key of sections) {
    const s = result.fields[key];
    assert.ok(s, `missing ${key}`);
    assert.ok(s._title.he, `no Hebrew title in ${key}`);
    assert.ok(s._title.en, `no English title in ${key}`);
    // Each declared field in FIELD_MAP_1301 must be present in output
    for (const f of Object.keys(FIELD_MAP_1301[key].fields)) {
      assert.ok(s.fields[f], `${key}.${f} missing`);
      assert.ok(typeof s.fields[f].line === 'string');
      assert.ok(s.fields[f].label_he);
      assert.ok(s.fields[f].label_en);
    }
  }
});

// ---------------------------------------------------------------------------
// normalizeInput — defaults + sanitisation
// ---------------------------------------------------------------------------

test('normalizeInput: defaults pointsPersonal to 2.25 when missing', () => {
  const n = normalizeInput({ taxpayer: { id: VALID_ID_1 } });
  assert.equal(n.credits.pointsPersonal, 2.25);
});

test('normalizeInput: NaNs and nulls coerce to 0', () => {
  const n = normalizeInput({
    taxpayer: { id: VALID_ID_1 },
    income: { employment: { gross: null } },
    deductions: { pension: NaN },
  });
  assert.equal(n.income.employment.gross, 0);
  assert.equal(n.deductions.pension, 0);
});

// ---------------------------------------------------------------------------
// renderPDF1301 — PDF dry-run (text stub) — never requires pdfkit
// ---------------------------------------------------------------------------

test('renderPDF1301: dry-run returns bilingual text stub', async () => {
  const result = generate1301({
    taxpayer: { id: VALID_ID_1, name: 'P' },
    income: { employment: { gross: 100000 } },
  });
  const out = await renderPDF1301(result); // no outputPath → dry run
  // Either pdfkit-missing (text stub) or pdfkit-present (dry run text).
  if (out.error === 'pdfkit_missing') {
    assert.ok(out.stub);
    assert.ok(out.text.includes('טופס 1301'));
    assert.ok(out.text.includes('Form 1301'));
  } else {
    assert.ok(out.text.includes('טופס 1301'));
    assert.ok(out.text.includes('Form 1301'));
  }
});
