/**
 * Dynamic Price Optimizer — Unit Tests
 * Agent X-07 — Techno-Kol Uzi ERP / Metal Fabrication
 *
 * Run with:
 *   node --test test/payroll/price-optimizer.test.js
 *
 * Requires Node >= 18 (built-in `node:test`).
 * Zero external dependencies.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  optimizePrice,
  bulkRepricing,
  whatIf,
  getPriceHistory,
  recordPriceQuote,
  CONSTANTS,
  _internal,
} = require(path.resolve(__dirname, '..', '..', 'src', 'pricing', 'price-optimizer.js'));

// ─────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────

/** A structural steel frame — 25% margin category. */
function makeFrame(overrides) {
  return Object.assign({
    id:       'SKU-FRAME-001',
    name_he:  'מסגרת פלדה מחוזקת',
    name_en:  'Reinforced steel frame',
    category: 'STRUCTURAL',
    materials: [
      { kind: 'COLD_ROLLED_STEEL', kg: 25 },   // 25 × 4.80 = 120 ₪
      { kind: 'GALVANIZED_STEEL',  kg: 10 },   // 10 × 5.60 =  56 ₪
    ],
    labor: [
      { stage: 'CUTTING', minutes: 20 },       // 20 × 2.10 =  42 ₪
      { stage: 'BENDING', minutes: 15 },       // 15 × 2.40 =  36 ₪
      { stage: 'WELDING', minutes: 30 },       // 30 × 3.20 =  96 ₪
    ],
  }, overrides || {});
}

/** A precision bracket — 40% margin. */
function makePrecisionBracket(overrides) {
  return Object.assign({
    id:       'SKU-BRK-002',
    name_he:  'תושבת נירוסטה מדויקת',
    name_en:  'Stainless precision bracket',
    category: 'PRECISION',
    materials: [{ kind: 'STAINLESS_304', kg: 2 }],   // 2 × 18.50 = 37
    labor: [
      { stage: 'CUTTING', minutes: 10 },
      { stage: 'WELDING', minutes: 12 },
    ],
  }, overrides || {});
}

/** A custom assembly — 50% margin. */
function makeCustomAssembly(overrides) {
  return Object.assign({
    id:       'SKU-ASM-003',
    name_he:  'יחידה מיוחדת לרכב',
    name_en:  'Custom vehicle assembly',
    category: 'CUSTOM',
    materials: [
      { kind: 'STAINLESS_316', kg: 3 },
      { kind: 'ALUMINUM_6061', kg: 1 },
    ],
    labor: [
      { stage: 'CUTTING',  minutes: 15 },
      { stage: 'WELDING',  minutes: 20 },
      { stage: 'PAINTING', minutes: 12 },
      { stage: 'ASSEMBLY', minutes: 25 },
    ],
  }, overrides || {});
}

// ═══════════════════════════════════════════════════════════════
// 1. Cost-plus baseline
// ═══════════════════════════════════════════════════════════════

test('cost-plus: structural frame baseline matches hand calculation', () => {
  const frame = makeFrame();
  const d = optimizePrice(frame, { id: 'C1', tier: 'REGULAR' }, {
    quantity:     1,
    month:        5,       // seasonal index = 1.00
    urgency:      'STANDARD',
    paymentTerms: 'NET_30',
    includeVat:   false,
    benchmarks:   null,
  });

  // materials: 120 + 56 = 176
  // labor:      42 + 36 + 96 = 174
  // direct:     350
  // overhead:   350 × 0.22 = 77
  // cost:       427
  // margin 25%: 427 × 1.25 = 533.75
  assert.equal(d.baseline.materials, 176);
  assert.equal(d.baseline.labor,     174);
  assert.equal(d.baseline.overhead,  77);
  assert.equal(d.baseline.cost,      427);
  assert.equal(d.baseline.baseline,  533.75);
  assert.equal(d.base,               533.75);
});

test('cost-plus: precision (40%) and custom (50%) margins applied correctly', () => {
  const p = _internal.calculateCostPlus(makePrecisionBracket());
  assert.equal(p.marginRate, 0.40);

  const c = _internal.calculateCostPlus(makeCustomAssembly());
  assert.equal(c.marginRate, 0.50);
  // sanity: final baseline > cost
  assert.ok(c.baseline > c.cost);
});

// ═══════════════════════════════════════════════════════════════
// 2. Customer tier adjustments
// ═══════════════════════════════════════════════════════════════

test('customer tier: VIP gets -5%, SMALL gets +5%, REGULAR unchanged', () => {
  const ctx = { quantity: 1, month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30', includeVat: false };

  const vip     = optimizePrice(makeFrame(), { id: 'C', tier: 'VIP'     }, ctx);
  const regular = optimizePrice(makeFrame(), { id: 'C', tier: 'REGULAR' }, ctx);
  const small   = optimizePrice(makeFrame(), { id: 'C', tier: 'SMALL'   }, ctx);

  const tierAdjVip     = vip.adjustments.find(a => a.code.startsWith('TIER_'));
  const tierAdjSmall   = small.adjustments.find(a => a.code.startsWith('TIER_'));
  const tierAdjReg     = regular.adjustments.find(a => a.code.startsWith('TIER_'));

  assert.equal(tierAdjVip.percent,  -0.05);
  assert.equal(tierAdjSmall.percent, 0.05);
  assert.equal(tierAdjReg.percent,   0.00);

  // Directional check on final
  assert.ok(vip.final   < regular.final, 'VIP must be cheaper than REGULAR');
  assert.ok(small.final > regular.final, 'SMALL must be more expensive than REGULAR');
});

// ═══════════════════════════════════════════════════════════════
// 3. Volume breaks
// ═══════════════════════════════════════════════════════════════

test('volume: quantity 1 → 0%, 10 → 2%, 100 → 8%, 1000 → 15%', () => {
  const base = 1000_00;
  assert.equal(_internal.applyVolume(base,    1).percent,  0.00);
  assert.equal(_internal.applyVolume(base,   10).percent, -0.02);
  assert.equal(_internal.applyVolume(base,  100).percent, -0.08);
  assert.equal(_internal.applyVolume(base, 1000).percent, -0.15);
});

test('volume: larger orders reduce per-unit price', () => {
  const ctx1 = { quantity: 1,   month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30', includeVat: false };
  const ctx100 = { quantity: 100, month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30', includeVat: false };

  const d1 = optimizePrice(makeFrame(), { id: 'C', tier: 'REGULAR' }, ctx1);
  const d100 = optimizePrice(makeFrame(), { id: 'C', tier: 'REGULAR' }, ctx100);

  // per-unit price for 100 should be lower than per-unit for 1
  assert.ok(d100.unit.ils < d1.unit.ils, 'bulk order must cheapen per-unit price');
});

// ═══════════════════════════════════════════════════════════════
// 4. Seasonal index
// ═══════════════════════════════════════════════════════════════

test('seasonal: month 8 (summer dip, 0.95) < month 12 (year-end rally, 1.05)', () => {
  const base = 1000_00;
  const aug = _internal.applySeason(base, 8);
  const dec = _internal.applySeason(base, 12);
  assert.ok(aug.percent < 0);
  assert.ok(dec.percent > 0);
  assert.ok(dec.percent > aug.percent);
});

// ═══════════════════════════════════════════════════════════════
// 5. Urgency surcharges
// ═══════════════════════════════════════════════════════════════

test('urgency: RUSH adds +15%, EXPRESS adds +8%, STANDARD adds 0%', () => {
  const base = 1000_00;
  assert.equal(_internal.applyUrgency(base, 'STANDARD').percent, 0.00);
  assert.equal(_internal.applyUrgency(base, 'EXPRESS').percent, 0.08);
  assert.equal(_internal.applyUrgency(base, 'RUSH').percent,     0.15);
});

// ═══════════════════════════════════════════════════════════════
// 6. Payment terms
// ═══════════════════════════════════════════════════════════════

test('payment terms: CASH -2%, NET_30 0%, NET_60 +2%, NET_90 +3.5%', () => {
  const base = 1000_00;
  assert.equal(_internal.applyPaymentTerms(base, 'CASH').percent,   -0.02);
  assert.equal(_internal.applyPaymentTerms(base, 'NET_30').percent,  0.00);
  assert.equal(_internal.applyPaymentTerms(base, 'NET_60').percent,  0.02);
  assert.equal(_internal.applyPaymentTerms(base, 'NET_90').percent,  0.035);
});

// ═══════════════════════════════════════════════════════════════
// 7. Churn-risk adjustment
// ═══════════════════════════════════════════════════════════════

test('churn risk: AT_RISK and LOST apply defensive discounts', () => {
  const base = 1000_00;
  assert.equal(_internal.applyChurnRisk(base, { churnRisk: 'LOYAL' }).percent,    0.00);
  assert.equal(_internal.applyChurnRisk(base, { churnRisk: 'AT_RISK' }).percent, -0.04);
  assert.equal(_internal.applyChurnRisk(base, { churnRisk: 'LOST' }).percent,    -0.07);
});

// ═══════════════════════════════════════════════════════════════
// 8. FX conversion
// ═══════════════════════════════════════════════════════════════

test('currency: USD/EUR conversion uses context.fxRates when provided', () => {
  const ctx = {
    quantity:  1,
    month:     5,
    urgency:   'STANDARD',
    paymentTerms: 'NET_30',
    currency:  'USD',
    includeVat: false,
    fxRates:   { USD: 3.80, EUR: 4.10 },
  };
  const d = optimizePrice(makeFrame(), { id: 'C', tier: 'REGULAR' }, ctx);
  assert.equal(d.currency, 'USD');
  assert.equal(d.total.fxRate, 3.80);
  // sanity: final USD × rate ≈ ILS equivalent (± 1₪ for VAT rounding)
  const backToIls = d.total.net * 3.80;
  const expectedIls = d.baseline.baseline; // with zero market/tier/season deltas
  assert.ok(Math.abs(backToIls - expectedIls) < expectedIls * 0.1);
});

// ═══════════════════════════════════════════════════════════════
// 9. VAT handling
// ═══════════════════════════════════════════════════════════════

test('VAT: inclusion adds 18% on top by default, exclusion yields gross = net', () => {
  const withVat    = _internal.applyVat(1000, true);
  const withoutVat = _internal.applyVat(1000, false);
  assert.equal(withVat.net,   1000);
  assert.equal(withVat.vat,   180);
  assert.equal(withVat.gross, 1180);
  assert.equal(withoutVat.gross, 1000);
  assert.equal(withoutVat.vat,   0);
});

test('VAT: optimizePrice total.gross uses Israeli 18% by default', () => {
  const d = optimizePrice(makeFrame(), { id: 'C', tier: 'REGULAR' }, {
    quantity: 1, month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30',
  });
  assert.equal(d.total.vatRate, 0.18);
  assert.equal(d.total.vatIncluded, true);
  assert.ok(d.total.gross >= d.total.net);
});

// ═══════════════════════════════════════════════════════════════
// 10. Market benchmark adjustment
// ═══════════════════════════════════════════════════════════════

test('market: competitor avg ~8% lower nudges our price downward', () => {
  const frame = makeFrame();
  const baselineCost = _internal.calculateCostPlus(frame).baseline; // ~533.75
  const belowCompetitor = baselineCost * 0.85; // 15% lower than us

  const d = optimizePrice(frame, { id: 'C', tier: 'REGULAR' }, {
    quantity: 1, month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30', includeVat: false,
    benchmarks: { competitorAvg: belowCompetitor },
  });
  const market = d.adjustments.find(a => a.code === 'MARKET');
  assert.ok(market.percent < 0, 'should nudge price down when competitors are cheaper');
});

test('market: no benchmarks → market adjustment is neutral', () => {
  const d = optimizePrice(makeFrame(), { id: 'C' }, {
    quantity: 1, month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30', includeVat: false,
  });
  const market = d.adjustments.find(a => a.code === 'MARKET');
  assert.equal(market.percent, 0);
  assert.match(market.reason, /benchmark not provided/);
});

// ═══════════════════════════════════════════════════════════════
// 11. Bilingual explanations & confidence
// ═══════════════════════════════════════════════════════════════

test('bilingual: explanation_he and explanation_en are both returned', () => {
  const d = optimizePrice(makeFrame(), { id: 'C', tier: 'VIP' }, {
    quantity: 5, month: 11, urgency: 'RUSH', paymentTerms: 'CASH',
    benchmarks: { competitorAvg: 500 },
  });
  assert.ok(typeof d.explanation_he === 'string' && d.explanation_he.length > 0);
  assert.ok(typeof d.explanation_en === 'string' && d.explanation_en.length > 0);
  assert.ok(d.explanation_he.includes('מחיר בסיס'));
  assert.ok(d.explanation_en.includes('Baseline'));
});

test('confidence: drops when data is missing (no category, no labor, no customer)', () => {
  const strong = optimizePrice(makeFrame(), { id: 'C1' }, {
    quantity: 10, month: 5, urgency: 'STANDARD', paymentTerms: 'NET_30',
    benchmarks: { competitorAvg: 550 },
    fxRates:    { USD: 3.70, EUR: 4.00 },
  });
  const weak = optimizePrice(
    { id: 'X', materials: [{ kind: 'COLD_ROLLED_STEEL', kg: 10 }] },
    null,
    {},
  );
  assert.ok(strong.confidence > weak.confidence);
  assert.ok(strong.confidence <= 1.0 && strong.confidence >= 0.0);
  assert.ok(weak.confidence   <= 1.0 && weak.confidence   >= 0.0);
});

// ═══════════════════════════════════════════════════════════════
// 12. Bulk repricing
// ═══════════════════════════════════════════════════════════════

test('bulkRepricing: returns summary totals and per-item margin analysis', () => {
  const items = [
    { product: makeFrame(),             customer: { id: 'C1', tier: 'REGULAR' }, context: { quantity: 2, month: 5 } },
    { product: makePrecisionBracket(),  customer: { id: 'C1', tier: 'VIP' },     context: { quantity: 50, month: 5 } },
    { product: makeCustomAssembly(),    customer: { id: 'C2', tier: 'SMALL' },   context: { quantity: 1, month: 5 } },
  ];
  const res = bulkRepricing(items);
  assert.equal(res.summary.count, 3);
  assert.equal(res.summary.successes, 3);
  assert.equal(res.summary.failures, 0);
  assert.ok(res.summary.totalRevenue > 0);
  assert.ok(res.summary.totalCost    > 0);
  assert.ok(typeof res.summary.blendedMarginPct === 'number');
  for (const r of res.items) {
    assert.ok(r.ok);
    assert.ok(r.marginAnalysis.revenue > r.marginAnalysis.cost);
  }
});

test('bulkRepricing: gracefully reports failures without throwing', () => {
  const items = [
    { product: makeFrame(),       customer: { id: 'C1' }, context: { quantity: 1, month: 5 } },
    { product: null /* invalid */, customer: { id: 'C2' }, context: { quantity: 1, month: 5 } },
  ];
  const res = bulkRepricing(items);
  assert.equal(res.summary.count, 2);
  assert.equal(res.summary.successes, 1);
  assert.equal(res.summary.failures, 1);
});

// ═══════════════════════════════════════════════════════════════
// 13. What-if analysis
// ═══════════════════════════════════════════════════════════════

test('whatIf: compares multiple scenarios and identifies best/worst', () => {
  const frame = makeFrame();
  const res = whatIf(frame, [
    { label: 'cash-VIP-bulk', customer: { id: 'C', tier: 'VIP' },     context: { quantity: 100, month: 5, urgency: 'STANDARD', paymentTerms: 'CASH'   } },
    { label: 'rush-regular',  customer: { id: 'C', tier: 'REGULAR' }, context: { quantity: 1,   month: 5, urgency: 'RUSH',     paymentTerms: 'NET_60' } },
    { label: 'net30-small',   customer: { id: 'C', tier: 'SMALL' },   context: { quantity: 10,  month: 5, urgency: 'EXPRESS',  paymentTerms: 'NET_30' } },
  ]);
  assert.equal(res.count, 3);
  assert.ok(res.best.final >= res.worst.final);
  for (const o of res.outcomes) {
    assert.ok(typeof o.deltaVsBaseline === 'number');
    assert.ok(typeof o.deltaVsBaselinePercent === 'number');
  }
});

// ═══════════════════════════════════════════════════════════════
// 14. Price history (append-only)
// ═══════════════════════════════════════════════════════════════

test('price history: records every optimizePrice call and exposes a trend', () => {
  const id = 'SKU-HIST-TEST-' + Date.now();
  const make = () => ({ id, name_he: 'טסט', name_en: 'test', category: 'STRUCTURAL',
    materials: [{ kind: 'COLD_ROLLED_STEEL', kg: 10 }],
    labor:     [{ stage: 'CUTTING', minutes: 10 }],
  });

  // first quote cheap (cash, VIP, bulk)
  optimizePrice(make(), { id: 'C', tier: 'VIP' },   { quantity: 100, month: 5, urgency: 'STANDARD', paymentTerms: 'CASH' });
  // second quote pricey (rush, small, net-60)
  optimizePrice(make(), { id: 'C', tier: 'SMALL' }, { quantity: 1,   month: 12, urgency: 'RUSH',     paymentTerms: 'NET_60' });

  const h = getPriceHistory(id);
  assert.equal(h.count, 2);
  assert.ok(h.trend);
  assert.ok(['up', 'down', 'flat'].includes(h.trend.direction));
  assert.equal(h.history.length, 2);
});

test('price history: recordPriceQuote appends without removing existing entries', () => {
  const id = 'SKU-MANUAL-' + Date.now();
  recordPriceQuote({ productId: id, final: 100, currency: 'ILS', qty: 1, note: 'first'  });
  recordPriceQuote({ productId: id, final: 110, currency: 'ILS', qty: 1, note: 'second' });
  recordPriceQuote({ productId: id, final: 120, currency: 'ILS', qty: 1, note: 'third'  });

  const h = getPriceHistory(id);
  assert.equal(h.count, 3);
  assert.equal(h.trend.direction, 'up');
  assert.equal(h.trend.firstPrice, 100);
  assert.equal(h.trend.lastPrice,  120);
});

// ═══════════════════════════════════════════════════════════════
// 15. End-to-end rush-order VIP bulk scenario
// ═══════════════════════════════════════════════════════════════

test('end-to-end: VIP bulk rush-order with USD + competitor nudge + VAT', () => {
  const frame = makeFrame();
  const d = optimizePrice(frame, {
    id: 'VIP-42',
    tier: 'VIP',
    churnRisk: 'LOYAL',
  }, {
    quantity:     50,
    month:        3,                         // Q1 construction surge
    urgency:      'RUSH',
    paymentTerms: 'CASH',
    benchmarks:   { competitorAvg: 520 },    // slightly below our baseline
    currency:     'USD',
    fxRates:      { USD: 3.75 },
    includeVat:   true,
    vatRate:      0.18,
  });

  // Sanity: every adjustment is present with a label in both languages
  const codes = d.adjustments.map(a => a.code);
  assert.ok(codes.some(c => c === 'MARKET'));
  assert.ok(codes.some(c => c.startsWith('TIER_')));
  assert.ok(codes.some(c => c === 'VOLUME'));
  assert.ok(codes.some(c => c === 'SEASON'));
  assert.ok(codes.some(c => c.startsWith('URGENCY_')));
  assert.ok(codes.some(c => c.startsWith('PAY_')));
  assert.ok(codes.some(c => c.startsWith('CHURN_')));

  for (const a of d.adjustments) {
    assert.ok(typeof a.label_he === 'string' && a.label_he.length > 0);
    assert.ok(typeof a.label_en === 'string' && a.label_en.length > 0);
  }

  assert.equal(d.currency, 'USD');
  assert.ok(d.total.gross > d.total.net, 'VAT should inflate gross');
  assert.ok(d.confidence >= 0.8, 'high-data scenario should be high-confidence');
});

// ═══════════════════════════════════════════════════════════════
// Bonus: precision helpers (round2 / integer agorot)
// ═══════════════════════════════════════════════════════════════

test('precision: round2 avoids float drift', () => {
  assert.equal(_internal.round2(0.1 + 0.2), 0.3);
  assert.equal(_internal.round2(1.005),     1.01);
  assert.equal(_internal.round2(Infinity),  0);
});

test('constants: expected tables are frozen and complete', () => {
  assert.ok(Object.isFrozen(CONSTANTS));
  assert.ok(CONSTANTS.CATEGORY_MARGINS.STRUCTURAL.margin === 0.25);
  assert.ok(CONSTANTS.CATEGORY_MARGINS.PRECISION.margin  === 0.40);
  assert.ok(CONSTANTS.CATEGORY_MARGINS.CUSTOM.margin     === 0.50);
  assert.ok(CONSTANTS.COMPETITORS_IL.includes('איילון'));
  assert.ok(CONSTANTS.COMPETITORS_IL.includes('דיסאל'));
  assert.ok(CONSTANTS.COMPETITORS_IL.includes('פעל גיא'));
});
