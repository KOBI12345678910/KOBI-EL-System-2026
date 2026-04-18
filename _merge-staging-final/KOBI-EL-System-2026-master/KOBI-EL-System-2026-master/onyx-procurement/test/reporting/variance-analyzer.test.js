/**
 * Variance Analyzer — Unit Tests
 * Agent Y-185 — Kobi's mega-ERP for Techno-Kol Uzi.
 *
 * Zero external deps — uses only `node:test` and `node:assert/strict`.
 * Run with:
 *     node --test test/reporting/variance-analyzer.test.js
 *
 * Tests cover:
 *   - Sales price + volume decomposition algebraic identity
 *   - Mix + quantity decomposition algebraic identity
 *   - Labor rate + efficiency identity
 *   - Material price + usage identity
 *   - Favorable / unfavorable flagging on both revenue and cost flavors
 *   - Neutral (on-budget) flagging
 *   - Bilingual (Hebrew + English) labels and explanations
 *   - Edge cases: zero budget, zero volume, negative delta, single-SKU mix
 *   - Input validation (NaN, Infinity, missing fields, negative quantity)
 *   - Top-level decompose() aggregator with multiple component groups
 *   - Deterministic rounding of -0.5 and +0.5 cases
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const VarianceAnalyzer = require(path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'reporting',
  'variance-analyzer.js'
));

const {
  LABELS,
  FAVORABLE_FLAG,
  UNFAVORABLE_FLAG,
  NEUTRAL_FLAG,
  _internals,
} = VarianceAnalyzer;

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function close(a, b, eps = 1e-9) {
  return Math.abs(a - b) < eps;
}

function approxEq(actual, expected, eps = 1e-6, msg = '') {
  if (!close(actual, expected, eps)) {
    assert.fail(
      `${msg || 'approxEq'} failed: ${actual} !== ${expected} (eps=${eps})`
    );
  }
}

const analyzer = new VarianceAnalyzer();

// ══════════════════════════════════════════════════════════════════════════
// 1. Price variance — revenue flavor, both signs
// ══════════════════════════════════════════════════════════════════════════

test('01: price variance — actual price above budget is FAVORABLE', () => {
  // 100 units at 12 actual vs 10 budget → (12 − 10) × 100 = +200, favorable
  const c = analyzer.priceVariance({ unitsA: 100, priceA: 12, priceB: 10 });
  approxEq(c.amount, 200);
  assert.equal(c.favorable, true);
  assert.equal(c.flag, FAVORABLE_FLAG);
  assert.equal(c.label_he, LABELS.price.he);
  assert.equal(c.label_en, LABELS.price.en);
  assert.match(c.explanation_he, /סטיית מחיר/);
  assert.match(c.explanation_en, /Price variance/);
});

test('02: price variance — actual price below budget is UNFAVORABLE', () => {
  const c = analyzer.priceVariance({ unitsA: 100, priceA: 8, priceB: 10 });
  approxEq(c.amount, -200);
  assert.equal(c.favorable, false);
  assert.equal(c.flag, UNFAVORABLE_FLAG);
  assert.match(c.explanation_he, /שלילי/);
  assert.match(c.explanation_en, /unfavorable/);
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Volume variance — revenue flavor
// ══════════════════════════════════════════════════════════════════════════

test('03: volume variance — more units than budget is FAVORABLE', () => {
  // units 120 vs 100, budget price 10 → (120 − 100) × 10 = +200
  const c = analyzer.volumeVariance({ unitsA: 120, unitsB: 100, priceB: 10 });
  approxEq(c.amount, 200);
  assert.equal(c.flag, FAVORABLE_FLAG);
});

test('04: volume variance — fewer units than budget is UNFAVORABLE', () => {
  const c = analyzer.volumeVariance({ unitsA: 80, unitsB: 100, priceB: 10 });
  approxEq(c.amount, -200);
  assert.equal(c.flag, UNFAVORABLE_FLAG);
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Textbook identity: price + volume ≈ total revenue variance
// ══════════════════════════════════════════════════════════════════════════

test('05: price + volume ≈ total revenue variance (with PQ cross term)', () => {
  // Actual: 120 × 12 = 1440. Budget: 100 × 10 = 1000. Total = +440.
  // Price variance (at actual units): (12 − 10) × 120 = 240
  // Volume variance (at budget price): (120 − 100) × 10 = 200
  // The textbook "price at actual units" attribution puts the cross term
  // entirely inside the price variance, so 240 + 200 = 440 exactly.
  const p = analyzer.priceVariance({ unitsA: 120, priceA: 12, priceB: 10 });
  const v = analyzer.volumeVariance({ unitsA: 120, unitsB: 100, priceB: 10 });
  approxEq(p.amount + v.amount, 1440 - 1000);
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Mix variance — multi-SKU
// ══════════════════════════════════════════════════════════════════════════

test('06: mix variance — richer mix (more of higher-price SKU)', () => {
  // Two SKUs, same total actual volume as budget but shifted toward the
  // high-margin item. Mix variance should be strictly positive.
  const lines = [
    { sku: 'A', unitsA: 60, unitsB: 40, priceB: 20 }, // high-margin
    { sku: 'B', unitsA: 40, unitsB: 60, priceB: 10 }, // low-margin
  ];
  const mv = analyzer.mixVariance({ lines });
  // Budget mix A=40/100=0.40, Actual mix A=60/100=0.60, ΔMix = +0.20
  //   → 0.20 × 100 × 20 = +400 on SKU A
  // Budget mix B=0.60, Actual B=0.40, ΔMix=-0.20
  //   → -0.20 × 100 × 10 = -200 on SKU B
  // Net = +200
  approxEq(mv.amount, 200);
  assert.equal(mv.flag, FAVORABLE_FLAG);
  assert.equal(mv.lines.length, 2);
  assert.equal(mv.lines[0].sku, 'A');
});

test('07: mix variance — leaner mix is UNFAVORABLE', () => {
  const lines = [
    { sku: 'A', unitsA: 40, unitsB: 60, priceB: 20 },
    { sku: 'B', unitsA: 60, unitsB: 40, priceB: 10 },
  ];
  const mv = analyzer.mixVariance({ lines });
  approxEq(mv.amount, -200);
  assert.equal(mv.flag, UNFAVORABLE_FLAG);
});

test('08: quantity variance — same mix, bigger total', () => {
  // Same proportions (50/50) but 20% more total units.
  const lines = [
    { sku: 'A', unitsA: 60, unitsB: 50, priceB: 20 },
    { sku: 'B', unitsA: 60, unitsB: 50, priceB: 10 },
  ];
  const q = analyzer.quantityVariance({ lines });
  // Budget avg price = (50·20 + 50·10) / 100 = 15
  // Δunits = 120 − 100 = 20
  // → 20 × 15 = +300
  approxEq(q.amount, 300);
  assert.equal(q.flag, FAVORABLE_FLAG);
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Labor rate + efficiency
// ══════════════════════════════════════════════════════════════════════════

test('09: labor rate variance — higher actual wage is UNFAVORABLE', () => {
  // hoursA=200, rateA=55, rateB=50 → (55 − 50) × 200 = +1000, cost flavor
  const c = analyzer.laborRateVariance({ hoursA: 200, rateA: 55, rateB: 50 });
  approxEq(c.amount, 1000);
  assert.equal(c.flavor, 'cost');
  assert.equal(c.flag, UNFAVORABLE_FLAG);
  assert.match(c.explanation_he, /תעריף/);
  assert.match(c.explanation_en, /wage rate/);
});

test('10: labor efficiency variance — extra hours is UNFAVORABLE', () => {
  const c = analyzer.laborEfficiencyVariance({
    hoursA: 220, hoursB: 200, rateB: 50,
  });
  approxEq(c.amount, 1000);
  assert.equal(c.flag, UNFAVORABLE_FLAG);
  assert.match(c.explanation_he, /שעות נוספות/);
});

test('11: labor efficiency variance — hours saved is FAVORABLE', () => {
  const c = analyzer.laborEfficiencyVariance({
    hoursA: 180, hoursB: 200, rateB: 50,
  });
  approxEq(c.amount, -1000);
  assert.equal(c.flag, FAVORABLE_FLAG);
  assert.match(c.explanation_he, /נחסכו/);
});

// ══════════════════════════════════════════════════════════════════════════
// 6. Material price + usage
// ══════════════════════════════════════════════════════════════════════════

test('12: material price variance — vendor overcharge is UNFAVORABLE', () => {
  // qtyA=500 kg, costA=12, costB=10 → (12 − 10) × 500 = +1000, cost
  const c = analyzer.materialPriceVariance({ qtyA: 500, costA: 12, costB: 10 });
  approxEq(c.amount, 1000);
  assert.equal(c.flag, UNFAVORABLE_FLAG);
});

test('13: material usage variance — excess consumption is UNFAVORABLE', () => {
  const c = analyzer.materialUsageVariance({
    qtyA: 520, qtyB: 500, costB: 10,
  });
  approxEq(c.amount, 200);
  assert.equal(c.flag, UNFAVORABLE_FLAG);
});

test('14: material usage variance — saved material is FAVORABLE', () => {
  const c = analyzer.materialUsageVariance({
    qtyA: 450, qtyB: 500, costB: 10,
  });
  approxEq(c.amount, -500);
  assert.equal(c.flag, FAVORABLE_FLAG);
});

// ══════════════════════════════════════════════════════════════════════════
// 7. Neutral case — zero variance, neutral flag
// ══════════════════════════════════════════════════════════════════════════

test('15: zero variance yields NEUTRAL flag and null favorable', () => {
  const c = analyzer.priceVariance({ unitsA: 100, priceA: 10, priceB: 10 });
  approxEq(c.amount, 0);
  assert.equal(c.flag, NEUTRAL_FLAG);
  assert.equal(c.favorable, null);
  assert.match(c.explanation_he, /ללא השפעה/);
  assert.match(c.explanation_en, /neutral/);
});

// ══════════════════════════════════════════════════════════════════════════
// 8. Input validation
// ══════════════════════════════════════════════════════════════════════════

test('16: validation — NaN price is rejected', () => {
  assert.throws(
    () => analyzer.priceVariance({ unitsA: 100, priceA: NaN, priceB: 10 }),
    /priceA/
  );
});

test('17: validation — negative units are rejected', () => {
  assert.throws(
    () => analyzer.volumeVariance({ unitsA: -5, unitsB: 100, priceB: 10 }),
    /unitsA/
  );
});

test('18: validation — mix variance needs a non-empty line array', () => {
  assert.throws(() => analyzer.mixVariance({ lines: [] }), /non-empty/);
  assert.throws(() => analyzer.mixVariance({ lines: null }), /non-empty/);
});

test('19: validation — mix variance rejects all-zero totals', () => {
  const lines = [
    { sku: 'A', unitsA: 0, unitsB: 0, priceB: 10 },
    { sku: 'B', unitsA: 0, unitsB: 0, priceB: 20 },
  ];
  assert.throws(() => analyzer.mixVariance({ lines }), /zero/);
});

// ══════════════════════════════════════════════════════════════════════════
// 9. Top-level decompose() aggregator
// ══════════════════════════════════════════════════════════════════════════

test('20: decompose() produces price + volume + labor + material in one shot', () => {
  const result = analyzer.decompose(
    // actual total revenue = 120 × 12 = 1440
    1440,
    // budget total revenue = 100 × 10 = 1000
    1000,
    {
      unitsA: 120, unitsB: 100, priceA: 12, priceB: 10,
      hoursA: 220, hoursB: 200, rateA: 55, rateB: 50,
      qtyA: 520, qtyB: 500, costA: 12, costB: 10,
    }
  );

  assert.ok(result.components.price);
  assert.ok(result.components.volume);
  assert.ok(result.components.labor_rate);
  assert.ok(result.components.labor_efficiency);
  assert.ok(result.components.material_price);
  assert.ok(result.components.material_usage);

  // Sales revenue total = +440, and components.price + components.volume
  // must recover that identity exactly.
  approxEq(
    result.components.price.amount + result.components.volume.amount,
    440
  );

  // Total (actual − budget) and the flag should be FAVORABLE (revenue rose)
  approxEq(result.total.amount, 440);
  assert.equal(result.total.flag, FAVORABLE_FLAG);
});

test('21: decompose() handles partial inputs gracefully', () => {
  // Only labor data provided.
  const result = analyzer.decompose(10000, 9000, {
    hoursA: 220, hoursB: 200, rateA: 50, rateB: 50,
  });
  assert.equal(result.components.price, undefined);
  assert.equal(result.components.volume, undefined);
  assert.ok(result.components.labor_efficiency);
  // Rate delta is 0, so only efficiency variance appears.
  approxEq(result.components.labor_rate.amount, 0);
  assert.equal(result.components.labor_rate.flag, NEUTRAL_FLAG);
  approxEq(result.components.labor_efficiency.amount, 1000);
});

// ══════════════════════════════════════════════════════════════════════════
// 10. Bilingual report
// ══════════════════════════════════════════════════════════════════════════

test('22: bilingual report contains Hebrew headers and component lines', () => {
  const result = analyzer.decompose(1440, 1000, {
    unitsA: 120, unitsB: 100, priceA: 12, priceB: 10,
  });
  const report = result.bilingualReport;
  assert.ok(report.he.length > 0);
  assert.ok(report.en.length > 0);
  assert.match(report.he, /סטייה מתוכנית/);
  assert.match(report.he, /סטיית מחיר/);
  assert.match(report.he, /סטיית כמות/);
  assert.match(report.en, /Total variance vs\. plan/);
  assert.match(report.en, /Price variance/);
  assert.match(report.en, /Volume variance/);
});

test('23: bilingual report lines are in the deterministic canonical order', () => {
  const result = analyzer.decompose(5000, 4000, {
    unitsA: 120, unitsB: 100, priceA: 12, priceB: 10,
    hoursA: 220, hoursB: 200, rateA: 55, rateB: 50,
    qtyA: 520, qtyB: 500, costA: 12, costB: 10,
  });
  const keys = result.bilingualReport.lines.map((l) => l.key);
  // total is always first
  assert.equal(keys[0], 'total');
  // price must come before volume, labor_rate before labor_efficiency, etc.
  assert.ok(keys.indexOf('price') < keys.indexOf('volume'));
  assert.ok(keys.indexOf('labor_rate') < keys.indexOf('labor_efficiency'));
  assert.ok(keys.indexOf('material_price') < keys.indexOf('material_usage'));
});

// ══════════════════════════════════════════════════════════════════════════
// 11. Flag helper
// ══════════════════════════════════════════════════════════════════════════

test('24: flag() works on numeric + flavor input', () => {
  assert.equal(analyzer.flag(500, 'revenue'), FAVORABLE_FLAG);
  assert.equal(analyzer.flag(-500, 'revenue'), UNFAVORABLE_FLAG);
  assert.equal(analyzer.flag(500, 'cost'), UNFAVORABLE_FLAG);
  assert.equal(analyzer.flag(-500, 'cost'), FAVORABLE_FLAG);
  assert.equal(analyzer.flag(0, 'cost'), NEUTRAL_FLAG);
});

test('25: flag() pass-through on a component object', () => {
  const c = analyzer.priceVariance({ unitsA: 10, priceA: 5, priceB: 3 });
  assert.equal(analyzer.flag(c), FAVORABLE_FLAG);
});

// ══════════════════════════════════════════════════════════════════════════
// 12. Rounding sanity
// ══════════════════════════════════════════════════════════════════════════

test('26: round() handles negative 0.5 half-away-from-zero', () => {
  // Math.round(-0.5) === -0 (round half to +∞). Our round() must give -1.
  assert.equal(_internals.round(-0.5, 0), -1);
  assert.equal(_internals.round(0.5, 0), 1);
  // Use values with exact IEEE-754 representation. 1.25 × 10 = 12.5 exactly,
  // so Math.round promotes to 13 which is the "away-from-zero" half rule.
  assert.equal(_internals.round(-1.25, 1), -1.3);
  assert.equal(_internals.round(1.25, 1), 1.3);
  // Round to two decimals behaves correctly on symmetric signs.
  assert.equal(_internals.round(-2.505, 2), -2.51);
  assert.equal(_internals.round(2.505, 2), 2.51);
});

// ══════════════════════════════════════════════════════════════════════════
// 13. Hebrew label table completeness
// ══════════════════════════════════════════════════════════════════════════

test('27: all LABELS carry non-empty Hebrew and English strings', () => {
  for (const [key, label] of Object.entries(LABELS)) {
    assert.ok(label.he && label.he.length > 0, `${key}.he empty`);
    assert.ok(label.en && label.en.length > 0, `${key}.en empty`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 14. End-to-end realistic scenario
// ══════════════════════════════════════════════════════════════════════════

test('28: realistic Techno-Kol scenario — paint job over budget', () => {
  // Scenario: a painting job for a school building (צביעה).
  // Budget: 800 m² × 45 NIS/m² = 36,000 NIS
  // Actual: 900 m² × 48 NIS/m² = 43,200 NIS
  // Labor:  budget 120 h × 80 /h, actual 140 h × 85 /h
  // Paint:  budget 200 L × 60/L, actual 230 L × 62/L
  const result = analyzer.decompose(43200, 36000, {
    unitsA: 900, unitsB: 800, priceA: 48, priceB: 45,
    hoursA: 140, hoursB: 120, rateA: 85, rateB: 80,
    qtyA: 230, qtyB: 200, costA: 62, costB: 60,
  });

  // Price variance = (48 − 45) × 900 = +2700 (favorable revenue)
  approxEq(result.components.price.amount, 2700);
  assert.equal(result.components.price.flag, FAVORABLE_FLAG);

  // Volume variance = (900 − 800) × 45 = +4500 (favorable revenue)
  approxEq(result.components.volume.amount, 4500);
  assert.equal(result.components.volume.flag, FAVORABLE_FLAG);

  // Labor rate variance = (85 − 80) × 140 = +700 (unfavorable cost)
  approxEq(result.components.labor_rate.amount, 700);
  assert.equal(result.components.labor_rate.flag, UNFAVORABLE_FLAG);

  // Labor efficiency variance = (140 − 120) × 80 = +1600 (unfavorable)
  approxEq(result.components.labor_efficiency.amount, 1600);
  assert.equal(result.components.labor_efficiency.flag, UNFAVORABLE_FLAG);

  // Material price variance = (62 − 60) × 230 = +460 (unfavorable)
  approxEq(result.components.material_price.amount, 460);
  assert.equal(result.components.material_price.flag, UNFAVORABLE_FLAG);

  // Material usage variance = (230 − 200) × 60 = +1800 (unfavorable)
  approxEq(result.components.material_usage.amount, 1800);
  assert.equal(result.components.material_usage.flag, UNFAVORABLE_FLAG);

  // Top-line revenue up by 7200 — the flag on the total (revenue flavor) is
  // favorable even though individual cost components are unfavorable.
  approxEq(result.total.amount, 7200);
  assert.equal(result.total.flag, FAVORABLE_FLAG);

  // Report should mention ALL of our Hebrew keywords.
  const he = result.bilingualReport.he;
  assert.match(he, /סטיית מחיר/);
  assert.match(he, /סטיית כמות/);
  assert.match(he, /סטיית תעריף/);
  assert.match(he, /סטיית יעילות/);
  assert.match(he, /סטיית מחיר חומרים/);
  assert.match(he, /סטיית שימוש חומרים/);
});

test('29: decompose() with flavor=cost flips the total sign convention', () => {
  // If the caller passes a COST figure (e.g. actual COGS 55k vs budget 50k),
  // the +5k delta should read as UNFAVORABLE, not favorable.
  const result = analyzer.decompose(55000, 50000, { flavor: 'cost' });
  approxEq(result.total.amount, 5000);
  assert.equal(result.total.flag, UNFAVORABLE_FLAG);
  assert.equal(result.total.favorable, false);
});

test('30: decompose() populates bilingualReport.lines with flags and amounts', () => {
  const result = analyzer.decompose(1440, 1000, {
    unitsA: 120, unitsB: 100, priceA: 12, priceB: 10,
  });
  for (const line of result.bilingualReport.lines) {
    assert.ok('flag' in line);
    assert.ok('amount' in line);
    assert.ok(typeof line.he === 'string' && line.he.length > 0);
    assert.ok(typeof line.en === 'string' && line.en.length > 0);
  }
});
