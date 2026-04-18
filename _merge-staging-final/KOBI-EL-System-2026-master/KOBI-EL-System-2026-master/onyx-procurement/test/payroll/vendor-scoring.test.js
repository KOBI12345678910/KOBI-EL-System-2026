/**
 * Tests for src/analytics/vendor-scoring.js
 * Techno-Kol Uzi — Swarm 3 / Agent X-05
 *
 * Runs on node's built-in test runner:
 *   node --test test/payroll/vendor-scoring.test.js
 *
 * No third-party dependencies. No deletions.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  scoreVendor,
  compareVendors,
  detectSingleSource,
  vendorScorecard,
  benchmarkSteelPrices,
  scoreOnTimeDelivery,
  scorePriceCompetitiveness,
  scoreQuality,
  scoreCommunication,
  scorePaymentTerms,
  badgeFor,
  priceDeltaToScore,
  normaliseHistory,
  BADGE_PREFERRED,
  BADGE_APPROVED,
  BADGE_MONITOR,
  BADGE_REMOVE,
  RISK_SINGLE_SOURCE,
  RISK_CONCENTRATION,
  RISK_DECLINING,
  RISK_LATE_STREAK,
  RISK_QUALITY,
  RISK_NO_HISTORY,
  WEIGHTS,
} = require('../../src/analytics/vendor-scoring.js');

// ─────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────

function po(overrides = {}) {
  const base = {
    id: 'po-' + Math.random().toString(36).slice(2, 8),
    category: 'steel-plate',
    urgent: false,
    orderedAt: new Date('2026-01-01'),
    promisedAt: new Date('2026-01-08'),
    deliveredAt: new Date('2026-01-08'),
    amount: 10000,
    unitPrice: 100,
    qty: 100,
    rejected: 0,
    rma: false,
    commHours: 4,
    paymentDays: 60,
    marketMedian: 100,
  };
  return Object.assign({}, base, overrides);
}

// A clean "preferred" vendor: everything green
function historyPreferred() {
  return [
    po({ id: 'P1' }),
    po({ id: 'P2', promisedAt: new Date('2026-02-08'), deliveredAt: new Date('2026-02-07'), orderedAt: new Date('2026-02-01') }),
    po({ id: 'P3', promisedAt: new Date('2026-03-08'), deliveredAt: new Date('2026-03-08'), orderedAt: new Date('2026-03-01'), unitPrice: 95, marketMedian: 100 }),
    po({ id: 'P4', promisedAt: new Date('2026-04-08'), deliveredAt: new Date('2026-04-07'), orderedAt: new Date('2026-04-01'), unitPrice: 92, marketMedian: 100 }),
  ];
}

// A "remove" vendor: late, expensive, rejects, slow comm, short terms
function historyBad() {
  return [
    po({
      id: 'B1',
      promisedAt: new Date('2026-01-08'),
      deliveredAt: new Date('2026-01-20'),          // 12 days late
      unitPrice: 140, marketMedian: 100,             // +40%
      rejected: 8, qty: 100, rma: true,              // 8% rejects + RMA
      commHours: 96,                                 // slow
      paymentDays: 7,                                // short
    }),
    po({
      id: 'B2',
      orderedAt: new Date('2026-02-01'),
      promisedAt: new Date('2026-02-08'),
      deliveredAt: new Date('2026-02-22'),          // 14 days late
      unitPrice: 145, marketMedian: 100,
      rejected: 10, qty: 100, rma: true,
      commHours: 120,
      paymentDays: 7,
    }),
    po({
      id: 'B3',
      orderedAt: new Date('2026-03-01'),
      promisedAt: new Date('2026-03-08'),
      deliveredAt: new Date('2026-03-25'),          // 17 days late
      unitPrice: 150, marketMedian: 100,
      rejected: 12, qty: 100, rma: true,
      commHours: 150,
      paymentDays: 7,
    }),
  ];
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

test('1. weights sum to exactly 1.0', () => {
  const total =
    WEIGHTS.onTimeDelivery +
    WEIGHTS.priceCompetitiveness +
    WEIGHTS.quality +
    WEIGHTS.communication +
    WEIGHTS.paymentTerms;
  assert.equal(Math.round(total * 100), 100);
});

test('2. badgeFor — threshold boundaries', () => {
  assert.equal(badgeFor(100), BADGE_PREFERRED);
  assert.equal(badgeFor(85.1), BADGE_PREFERRED);
  assert.equal(badgeFor(85), BADGE_APPROVED);      // 70..85 inclusive
  assert.equal(badgeFor(70), BADGE_APPROVED);
  assert.equal(badgeFor(69.9), BADGE_MONITOR);
  assert.equal(badgeFor(50), BADGE_MONITOR);
  assert.equal(badgeFor(49.9), BADGE_REMOVE);
  assert.equal(badgeFor(0), BADGE_REMOVE);
});

test('3. scoreVendor — preferred vendor gets Preferred badge', () => {
  const res = scoreVendor('V-PREFERRED', historyPreferred());
  assert.equal(res.vendorId, 'V-PREFERRED');
  assert.ok(res.composite > 85, `expected >85 got ${res.composite}`);
  assert.equal(res.badge, BADGE_PREFERRED);
  assert.equal(res.badgeEn, 'Preferred');
  assert.equal(res.samples, 4);
});

test('4. scoreVendor — bad vendor gets Remove badge', () => {
  const res = scoreVendor('V-BAD', historyBad());
  assert.ok(res.composite < 50, `expected <50 got ${res.composite}`);
  assert.equal(res.badge, BADGE_REMOVE);
  // All dimensions should be red
  assert.ok(res.dimensions.onTimeDelivery.score < 50);
  assert.ok(res.dimensions.priceCompetitiveness.score < 50);
  assert.ok(res.dimensions.quality.score < 50);
  assert.ok(res.dimensions.communication.score < 50);
  assert.ok(res.dimensions.paymentTerms.score < 50);
});

test('5. scoreOnTimeDelivery — honours urgent 24h window', () => {
  const pos = normaliseHistory([
    // Urgent: promised 2026-01-01 10:00, delivered 2026-01-02 08:00 (22h late but within 24h)
    {
      id: 'U1', urgent: true,
      orderedAt: '2026-01-01T08:00:00Z',
      promisedAt: '2026-01-01T10:00:00Z',
      deliveredAt: '2026-01-02T08:00:00Z',
      qty: 1, unitPrice: 100, marketMedian: 100,
    },
    // Urgent: delivered 30h late -> full late
    {
      id: 'U2', urgent: true,
      orderedAt: '2026-01-03T08:00:00Z',
      promisedAt: '2026-01-03T10:00:00Z',
      deliveredAt: '2026-01-04T16:00:00Z',   // 30h after promised
      qty: 1, unitPrice: 100, marketMedian: 100,
    },
  ]).pos;
  const r = scoreOnTimeDelivery(pos);
  // U1 is half-credit (within 24h window), U2 is late
  assert.equal(r.samples, 2);
  assert.ok(r.score > 0);
  assert.ok(r.score < 100);
});

test('6. scorePriceCompetitiveness — 10% below median is perfect', () => {
  const pos = normaliseHistory([
    po({ id: 'C1', unitPrice: 90, marketMedian: 100 }),
  ]).pos;
  const r = scorePriceCompetitiveness(pos);
  assert.equal(r.score, 100);
});

test('7. scorePriceCompetitiveness — 20% above median is low', () => {
  const pos = normaliseHistory([
    po({ id: 'C2', unitPrice: 120, marketMedian: 100 }),
  ]).pos;
  const r = scorePriceCompetitiveness(pos);
  assert.ok(r.score <= 25, `expected <=25 got ${r.score}`);
});

test('8. priceDeltaToScore — Ramat Golan coop uplift inside tolerance', () => {
  // +2% over median would normally be ~72. Coop uplift keeps it at 80 (zeroed).
  const plain = priceDeltaToScore(0.02, false);
  const coop = priceDeltaToScore(0, true);     // delta is zeroed for coop
  assert.ok(coop >= plain, 'cooperative should not be penalised');
});

test('9. scoreQuality — zero defects = 100', () => {
  const pos = normaliseHistory([po({ id: 'Q1', qty: 500, rejected: 0, rma: false })]).pos;
  const r = scoreQuality(pos);
  assert.equal(r.score, 100);
  assert.equal(r.rejectRate, 0);
});

test('10. scoreQuality — 10% rejects + RMA = very low', () => {
  const pos = normaliseHistory([
    po({ id: 'Q2', qty: 100, rejected: 10, rma: true }),
  ]).pos;
  const r = scoreQuality(pos);
  assert.ok(r.score < 30, `expected <30 got ${r.score}`);
});

test('11. scoreCommunication — 2h avg response = perfect', () => {
  const pos = normaliseHistory([po({ commHours: 2 }), po({ commHours: 3 })]).pos;
  const r = scoreCommunication(pos, []);
  assert.equal(r.score, 100);
});

test('12. scoreCommunication — uses communications[] when provided', () => {
  const { pos, communications } = normaliseHistory({
    purchaseOrders: [po()],
    communications: [
      { requestAt: '2026-01-01T08:00:00Z', responseAt: '2026-01-01T10:00:00Z' }, // 2h
      { requestAt: '2026-01-02T08:00:00Z', responseAt: '2026-01-02T12:00:00Z' }, // 4h
    ],
  });
  const r = scoreCommunication([], communications);
  assert.ok(r.score >= 85);
  // also verify pos-based normalisation isn't empty
  assert.equal(pos.length, 1);
});

test('13. scorePaymentTerms — net 90 = perfect, net 7 = low', () => {
  const posGood = normaliseHistory([po({ paymentDays: 90 })]).pos;
  const posBad = normaliseHistory([po({ paymentDays: 7 })]).pos;
  const posVeryBad = normaliseHistory([po({ paymentDays: 3 })]).pos;
  assert.equal(scorePaymentTerms(posGood, []).score, 100);
  // net 7 sits on the bronze edge (30). Not catastrophic, but clearly weak.
  assert.ok(scorePaymentTerms(posBad, []).score <= 35);
  // sub-7 days hits the hard floor
  assert.ok(scorePaymentTerms(posVeryBad, []).score <= 20);
});

test('14. detectSingleSource — >60% of category triggers warning', () => {
  const catalog = [
    { category: 'steel-plate', vendorId: 'ACME', amount: 70000 },
    { category: 'steel-plate', vendorId: 'BETA', amount: 30000 },
    { category: 'aluminium', vendorId: 'GAMMA', amount: 50000 },
    { category: 'aluminium', vendorId: 'DELTA', amount: 50000 },
  ];
  const warns = detectSingleSource(catalog);
  const steel = warns.find((w) => w.category === 'steel-plate');
  assert.ok(steel, 'expected steel-plate warning');
  assert.equal(steel.vendorId, 'ACME');
  assert.equal(steel.sharePct, 70);
  // aluminium is 50/50 — no warning
  assert.equal(warns.find((w) => w.category === 'aluminium'), undefined);
});

test('15. detectSingleSource — filter by category', () => {
  const catalog = [
    { category: 'steel-plate', vendorId: 'A', amount: 800 },
    { category: 'steel-plate', vendorId: 'B', amount: 200 },
    { category: 'copper-wire', vendorId: 'C', amount: 900 },
    { category: 'copper-wire', vendorId: 'D', amount: 100 },
  ];
  const steelOnly = detectSingleSource(catalog, 'steel-plate');
  assert.equal(steelOnly.length, 1);
  assert.equal(steelOnly[0].category, 'steel-plate');
});

test('16. compareVendors — ranks high to low', () => {
  const ranked = compareVendors([
    { vendorId: 'BAD', history: historyBad() },
    { vendorId: 'GOOD', history: historyPreferred() },
  ]);
  assert.equal(ranked[0].vendorId, 'GOOD');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].vendorId, 'BAD');
  assert.equal(ranked[1].rank, 2);
  assert.ok(ranked[0].composite > ranked[1].composite);
});

test('17. detectRisks — late streak ≥3 flagged', () => {
  const res = scoreVendor('V-LATE', historyBad());
  const lateRisk = res.risks.find((r) => r.code === RISK_LATE_STREAK);
  assert.ok(lateRisk, 'expected late-streak risk');
  assert.equal(lateRisk.severity, 'high');
});

test('18. detectRisks — quality red line >5% rejects', () => {
  const res = scoreVendor('V-Q', historyBad());
  const qr = res.risks.find((r) => r.code === RISK_QUALITY);
  assert.ok(qr, 'expected quality red-line risk');
});

test('19. detectRisks — concentration when shareOfSpend > 30%', () => {
  const res = scoreVendor('V-CONC', {
    purchaseOrders: historyPreferred(),
    shareOfSpend: 0.45,
  });
  const cr = res.risks.find((r) => r.code === RISK_CONCENTRATION);
  assert.ok(cr, 'expected concentration risk');
  assert.ok(cr.detail.includes('45%'));
});

test('20. detectRisks — declining trend from recentScores', () => {
  const res = scoreVendor('V-DECL', {
    purchaseOrders: historyPreferred(),
    recentScores: [95, 92, 88, 85, 82], // 13pt drop
  });
  const dr = res.risks.find((r) => r.code === RISK_DECLINING);
  assert.ok(dr, 'expected declining risk');
});

test('21. detectRisks — empty history -> no-history risk', () => {
  const res = scoreVendor('V-EMPTY', []);
  assert.equal(res.samples, 0);
  const nr = res.risks.find((r) => r.code === RISK_NO_HISTORY);
  assert.ok(nr);
});

test('22. detectRisks — single-source category flagged via extra', () => {
  const res = scoreVendor('V-SS', {
    purchaseOrders: historyPreferred(),
    singleSourceCategories: ['steel-plate'],
  });
  const sr = res.risks.find((r) => r.code === RISK_SINGLE_SOURCE);
  assert.ok(sr);
  assert.ok(sr.detail.includes('steel-plate'));
});

test('23. recommendations — preferred vendor gets "expand" advice', () => {
  const res = scoreVendor('V-TOP', historyPreferred());
  const joined = res.recommendations.join(' | ');
  assert.match(joined, /להגדיל|הסכם מסגרת/);
});

test('24. recommendations — bad vendor gets "remove" advice', () => {
  const res = scoreVendor('V-LOW', historyBad());
  const joined = res.recommendations.join(' | ');
  assert.match(joined, /להוציא|רשימת הספקים/);
});

test('25. vendorScorecard — Hebrew + English labels in report', () => {
  const report = vendorScorecard('V-RPT', historyPreferred());
  assert.ok(typeof report === 'string');
  assert.match(report, /כרטיס ביצוע ספק/);
  assert.match(report, /Vendor Scorecard/);
  assert.match(report, /On-time/);
  assert.match(report, /אספקה בזמן/);
  assert.match(report, /איכות/);
  assert.match(report, /ציון משוקלל/);
  assert.match(report, /Composite/);
  // should include all five dimensions
  assert.match(report, /Price/);
  assert.match(report, /Communication/);
  assert.match(report, /Payment/);
});

test('26. vendorScorecard — bad vendor includes risks section', () => {
  const report = vendorScorecard('V-RPT-BAD', historyBad());
  assert.match(report, /סיכונים/);
  assert.match(report, /Risks/);
  assert.match(report, /המלצות/);
});

test('27. benchmarkSteelPrices — monthly LME index alignment', () => {
  const pos = normaliseHistory([
    po({ id: 'M1', orderedAt: '2026-01-15', unitPrice: 100, marketMedian: 100 }),
    po({ id: 'M2', orderedAt: '2026-02-15', unitPrice: 110, marketMedian: 100 }),
    po({ id: 'M3', orderedAt: '2026-03-15', unitPrice: 95, marketMedian: 100 }),
  ]).pos;
  const index = { '2026-01': 100, '2026-02': 105, '2026-03': 100 };
  const r = benchmarkSteelPrices(pos, index);
  assert.equal(r.samples, 3);
  assert.equal(r.months.length, 3);
  // Jan vendor 100 vs index 100 -> 0
  assert.equal(r.months[0].delta, 0);
  // Feb vendor 110 vs index 105 -> ~+4.76%
  assert.ok(r.months[1].delta > 0.04);
  // Mar vendor 95 vs index 100 -> -5%
  assert.equal(r.months[2].delta, -0.05);
});

test('28. normaliseHistory — accepts array or object shape', () => {
  const arr = normaliseHistory([po(), po()]);
  assert.equal(arr.pos.length, 2);

  const obj = normaliseHistory({ purchaseOrders: [po()], communications: [{}] });
  assert.equal(obj.pos.length, 1);
  assert.equal(obj.communications.length, 1);

  // legacy keys
  const legacy = normaliseHistory({ pos: [po()], payments: [{ netDays: 60 }] });
  assert.equal(legacy.pos.length, 1);
  assert.equal(legacy.payments.length, 1);

  // invalid input
  const empty = normaliseHistory(null);
  assert.equal(empty.pos.length, 0);
});

test('29. cooperative kibbutz detection via vendorName', () => {
  const h = normaliseHistory([
    { id: 'K1', vendorName: 'קיבוץ יזרעאל מתכות', unitPrice: 102, marketMedian: 100, qty: 10, orderedAt: '2026-01-01', promisedAt: '2026-01-08', deliveredAt: '2026-01-08' },
  ]);
  assert.equal(h.pos[0].isCooperative, true);
  const s = scorePriceCompetitiveness(h.pos);
  // 2% over but coop -> should be zeroed, near 80
  assert.ok(s.score >= 75, `coop price score too low: ${s.score}`);
});

test('30. composite math matches weighted sum manually', () => {
  const res = scoreVendor('V-MATH', historyPreferred());
  const d = res.dimensions;
  const manual =
    d.onTimeDelivery.score * WEIGHTS.onTimeDelivery +
    d.priceCompetitiveness.score * WEIGHTS.priceCompetitiveness +
    d.quality.score * WEIGHTS.quality +
    d.communication.score * WEIGHTS.communication +
    d.paymentTerms.score * WEIGHTS.paymentTerms;
  // allow rounding tolerance
  assert.ok(Math.abs(res.composite - manual) < 0.2);
});

test('31. scoreVendor never mutates input history array', () => {
  const hist = historyPreferred();
  const before = JSON.stringify(hist);
  scoreVendor('V-IMM', hist);
  const after = JSON.stringify(hist);
  assert.equal(before, after);
});

test('32. detectSingleSource — 80%+ share is critical severity', () => {
  const catalog = [
    { category: 'copper', vendorId: 'MONO', amount: 850 },
    { category: 'copper', vendorId: 'X', amount: 150 },
  ];
  const w = detectSingleSource(catalog);
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'critical');
});
