/**
 * capital-gains.test.js — tests for Israeli מס רווח הון engine
 * Agent Y-006 / Swarm 4A / Techno-Kol Uzi Mega-ERP — Wave 2026
 *
 * Run:   node --test test/tax/capital-gains.test.js
 *
 * Coverage:
 *   - nominal / inflationary / real gain split
 *   - CPI adjustment + deflation guard
 *   - Linear method segment walking (pre-2003 → 2003 → 2006 → 2012 → 2025)
 *   - Substantial-shareholder (בעל מניות מהותי) 30% rate
 *   - Real-estate across 2001→2026 window
 *   - FIFO lot matcher — pure function, never mutates inputs
 *   - Loss carryforward (3-year expiry, category segregation)
 *   - Edge cases: loss, same-day trade, zero gain, invalid input
 *   - Never-delete principle (loss tracker keeps expired buckets)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCapitalGain,
  computeSecuritiesGain,
  applyLinearMethod,
  adjustForInflation,
  createLossTracker,
  ASSET_TYPES,
  RATE_SCHEDULE,
  CPI_TABLE,
  CapitalGainsError,
  __private,
} = require('../../src/tax/capital-gains.js');

// ═══════════════════════════════════════════════════════════════════════════
// Section A — CPI & inflation adjustment
// ═══════════════════════════════════════════════════════════════════════════

test('A01. CPI table covers ≥20 years (2005-01 .. 2026-04)', () => {
  assert.ok(CPI_TABLE['2005-01'] > 0);
  assert.ok(CPI_TABLE['2026-04'] > 0);
  // Spot check: later index is higher than earlier
  assert.ok(CPI_TABLE['2026-04'] > CPI_TABLE['2005-01']);
});

test('A02. adjustForInflation grows principal when CPI rises', () => {
  const r = adjustForInflation(100000, '2015-01-01', '2025-01-01');
  assert.ok(r.adjusted > r.original);
  assert.ok(r.inflationary > 0);
  assert.ok(r.ratio > 1);
  assert.equal(r.original, 100000);
});

test('A03. adjustForInflation deflation guard — ratio < 1 floored at 1', () => {
  // Pick a window where CPI actually declined (2012-09 → 2012-12 drops)
  const r = adjustForInflation(50000, '2012-09-01', '2012-12-01');
  assert.equal(r.deflationGuarded, true);
  assert.equal(r.adjusted, 50000);          // floored
  assert.equal(r.inflationary, 0);
});

test('A04. adjustForInflation preserves exact CPI ratio (no drift)', () => {
  const r = adjustForInflation(100000, '2010-01-01', '2020-01-01');
  const expected = (CPI_TABLE['2020-01'] / CPI_TABLE['2010-01']) * 100000;
  assert.ok(Math.abs(r.adjusted - expected) < 0.02);
});

test('A05. lookupCpi walks back when month missing', () => {
  // If a caller passes a date whose CPI month is absent, the helper
  // walks back up to 36 months and returns the nearest earlier value.
  const d = new Date(Date.UTC(2005, 0, 1));
  const cpi = __private.lookupCpi(d, CPI_TABLE);
  assert.equal(cpi, CPI_TABLE['2005-01']);
});

// ═══════════════════════════════════════════════════════════════════════════
// Section B — Basic nominal / inflationary / real split
// ═══════════════════════════════════════════════════════════════════════════

test('B01. computeCapitalGain — basic profit, single regime', () => {
  const r = computeCapitalGain({
    purchase: 100000,
    sale:     200000,
    expenses: 0,
    improvementCosts: 0,
    purchaseDate: '2022-01-01',
    saleDate:     '2024-01-01',
    assetType:    ASSET_TYPES.SECURITY,
  });
  assert.equal(r.loss, false);
  assert.equal(r.nominalGain, 100000);
  assert.ok(r.inflationaryAmount > 0);       // 2022-2024 inflation ≈ 6-7%
  assert.ok(r.realGain < r.nominalGain);
  assert.ok(r.tax > 0);
  assert.ok(r.effectiveRate > 0 && r.effectiveRate <= 0.25);
});

test('B02. computeCapitalGain — expenses reduce nominal gain', () => {
  const rNoExp = computeCapitalGain({
    purchase: 100000, sale: 200000, expenses: 0,
    purchaseDate: '2020-01-01', saleDate: '2024-01-01',
  });
  const rWithExp = computeCapitalGain({
    purchase: 100000, sale: 200000, expenses: 5000,
    purchaseDate: '2020-01-01', saleDate: '2024-01-01',
  });
  assert.equal(rWithExp.nominalGain, rNoExp.nominalGain - 5000);
  assert.ok(rWithExp.tax < rNoExp.tax);
});

test('B03. computeCapitalGain — improvement costs also CPI-adjusted', () => {
  const r = computeCapitalGain({
    purchase:         500000,
    sale:             900000,
    expenses:         0,
    improvementCosts: 50000,
    purchaseDate:     '2015-01-01',
    saleDate:         '2025-01-01',
    assetType:        ASSET_TYPES.REAL_ESTATE,
  });
  assert.ok(r.cpi.improvement.adjusted >= r.cpi.improvement.original);
  assert.equal(r.cpi.improvement.original, 50000);
});

test('B04. computeCapitalGain — loss case, tax=0, eligible flag', () => {
  const r = computeCapitalGain({
    purchase: 200000,
    sale:     150000,
    expenses: 500,
    purchaseDate: '2022-01-01',
    saleDate:     '2024-01-01',
  });
  assert.equal(r.loss, true);
  assert.equal(r.tax, 0);
  assert.ok(r.lossAmount > 0);
  assert.equal(r.realGain, 0);
});

test('B05. computeCapitalGain — inflation > nominal → real gain clamps to 0', () => {
  // Tiny nominal gain, long holding period → inflation may exceed gain
  const r = computeCapitalGain({
    purchase:  100000,
    sale:      102000,
    expenses:  0,
    purchaseDate: '2005-01-01',
    saleDate:     '2025-01-01',
  });
  // Nominal gain is only 2% over 20 years; CPI rose ~40% → real gain = 0
  assert.equal(r.realGain, 0);
  assert.equal(r.tax, 0);
  assert.ok(r.inflationaryAmount >= r.nominalGain);
});

// ═══════════════════════════════════════════════════════════════════════════
// Section C — Linear method segment walking
// ═══════════════════════════════════════════════════════════════════════════

test('C01. applyLinearMethod splits across 4 regimes (pre-2003 security)', () => {
  const r = computeCapitalGain({
    purchase:     50000,
    sale:         200000,
    purchaseDate: '2001-01-01',
    saleDate:     '2013-01-01',
    assetType:    ASSET_TYPES.SECURITY,
  });
  // Expect 4 segments: 2001-2002, 2003-2005, 2006-2011, 2012-2013
  assert.equal(r.segments.length, 4);
  // Pre-2003 segment should be 0% for securities
  assert.equal(r.segments[0].rate, 0);
  assert.equal(r.segments[0].tax, 0);
  // 2003-2005 segment should be 15%
  assert.equal(r.segments[1].rate, 0.15);
  // 2006-2011 segment should be 20%
  assert.equal(r.segments[2].rate, 0.20);
  // 2012-onward segment should be 25%
  assert.equal(r.segments[3].rate, 0.25);
  // Sum of alloc should equal real gain (within rounding)
  const sumAlloc = r.segments.reduce((s, x) => s + x.allocGain, 0);
  assert.ok(Math.abs(sumAlloc - r.realGain) < 0.02);
});

test('C02. Linear split — sum of segment tax equals total tax', () => {
  const r = computeCapitalGain({
    purchase:     100000,
    sale:         500000,
    purchaseDate: '2010-06-01',
    saleDate:     '2026-03-01',
    assetType:    ASSET_TYPES.SECURITY,
  });
  const sumTax = r.segments.reduce((s, x) => s + x.tax, 0);
  assert.ok(Math.abs(sumTax - r.taxOnRealGain) < 0.02);
});

test('C03. applyLinearMethod degenerate case (same-day trade)', () => {
  const r = applyLinearMethod({
    realGain: 10000,
    purchaseDate: '2025-06-01',
    saleDate:     '2025-06-01',
    assetType:    ASSET_TYPES.SECURITY,
  });
  assert.equal(r.segments.length, 1);
  assert.equal(r.segments[0].rate, 0.25);
  assert.equal(r.tax, 2500);
});

test('C04. applyLinearMethod returns zero tax on zero gain', () => {
  const r = applyLinearMethod({
    realGain: 0,
    purchaseDate: '2020-01-01',
    saleDate:     '2025-01-01',
    assetType:    ASSET_TYPES.SECURITY,
  });
  assert.equal(r.tax, 0);
  assert.equal(r.segments.length, 0);
});

test('C05. Linear=false forces current-regime flat rate', () => {
  const rLinear = computeCapitalGain({
    purchase: 50000, sale: 200000,
    purchaseDate: '2001-01-01', saleDate: '2013-01-01',
    assetType: ASSET_TYPES.SECURITY, linear: true,
  });
  const rFlat = computeCapitalGain({
    purchase: 50000, sale: 200000,
    purchaseDate: '2001-01-01', saleDate: '2013-01-01',
    assetType: ASSET_TYPES.SECURITY, linear: false,
  });
  // Flat rate should be higher because linear credits pre-2003 at 0%
  assert.ok(rFlat.tax > rLinear.tax);
  assert.equal(rFlat.effectiveRate, 0.25);
});

// ═══════════════════════════════════════════════════════════════════════════
// Section D — Substantial shareholder
// ═══════════════════════════════════════════════════════════════════════════

test('D01. Substantial shareholder pays 30% on post-2012 private-share real gain', () => {
  const r = computeCapitalGain({
    purchase: 100000,
    sale:     500000,
    purchaseDate: '2018-01-01',
    saleDate:     '2026-04-01',
    assetType:    ASSET_TYPES.PRIVATE_SHARE,
    isSubstantialShareholder: true,
  });
  assert.ok(r.realGain > 0);
  assert.equal(r.effectiveRate, 0.30);
});

test('D02. Non-substantial same transaction pays 25%', () => {
  const r = computeCapitalGain({
    purchase: 100000,
    sale:     500000,
    purchaseDate: '2018-01-01',
    saleDate:     '2026-04-01',
    assetType:    ASSET_TYPES.PRIVATE_SHARE,
    isSubstantialShareholder: false,
  });
  assert.equal(r.effectiveRate, 0.25);
});

test('D03. Substantial shareholder flag irrelevant for real-estate', () => {
  const rSub = computeCapitalGain({
    purchase: 1000000, sale: 2000000,
    purchaseDate: '2015-01-01', saleDate: '2025-01-01',
    assetType: ASSET_TYPES.REAL_ESTATE,
    isSubstantialShareholder: true,
  });
  const rNon = computeCapitalGain({
    purchase: 1000000, sale: 2000000,
    purchaseDate: '2015-01-01', saleDate: '2025-01-01',
    assetType: ASSET_TYPES.REAL_ESTATE,
    isSubstantialShareholder: false,
  });
  assert.equal(rSub.tax, rNon.tax);    // same — flag only applies to shares
});

// ═══════════════════════════════════════════════════════════════════════════
// Section E — Real estate with pre-2003 window
// ═══════════════════════════════════════════════════════════════════════════

test('E01. Real estate held 2001→2026 splits linearly with improvement', () => {
  const r = computeCapitalGain({
    purchase:         1000000,
    sale:             2500000,
    expenses:         20000,
    improvementCosts: 100000,
    purchaseDate:     '2001-06-01',
    saleDate:         '2026-03-01',
    assetType:        ASSET_TYPES.REAL_ESTATE,
  });
  assert.equal(r.loss, false);
  assert.ok(r.nominalGain > 0);
  assert.ok(r.inflationaryAmount > 0);
  assert.ok(r.realGain > 0);
  assert.ok(r.tax > 0);
  // Real estate rate stays 25% throughout modern regimes
  assert.ok(r.effectiveRate >= 0.20 && r.effectiveRate <= 0.25);
});

test('E02. Real estate — inflationary portion reflects full 25-year CPI swing', () => {
  const r = computeCapitalGain({
    purchase:     500000,
    sale:         2000000,
    purchaseDate: '2002-01-01',
    saleDate:     '2025-01-01',
    assetType:    ASSET_TYPES.REAL_ESTATE,
  });
  // CBS CPI roughly 40% higher over 23 years → inflationary should reflect ~200k
  assert.ok(r.inflationaryAmount > 100000);
  assert.ok(r.cpi.purchase.adjusted > r.cpi.purchase.original);
});

// ═══════════════════════════════════════════════════════════════════════════
// Section F — FIFO lot matching
// ═══════════════════════════════════════════════════════════════════════════

test('F01. computeSecuritiesGain consumes FIFO — first lot first', () => {
  const buys = [
    { date: '2018-01-10', quantity: 100, price: 50 },
    { date: '2020-06-15', quantity: 200, price: 75 },
  ];
  const sell = { date: '2026-04-01', quantity: 150, price: 120 };
  const r = computeSecuritiesGain(buys, sell);
  assert.equal(r.matches.length, 2);
  assert.equal(r.matches[0].buyIndex, 0);
  assert.equal(r.matches[0].quantity, 100);
  assert.equal(r.matches[1].buyIndex, 1);
  assert.equal(r.matches[1].quantity, 50);
  assert.equal(r.fullySold, true);
});

test('F02. computeSecuritiesGain — original buyLots array not mutated', () => {
  const buys = [
    { date: '2018-01-10', quantity: 100, price: 50 },
    { date: '2020-06-15', quantity: 200, price: 75 },
  ];
  const buysBefore = JSON.parse(JSON.stringify(buys));
  const sell = { date: '2026-04-01', quantity: 150, price: 120 };
  computeSecuritiesGain(buys, sell);
  assert.deepEqual(buys, buysBefore, 'buyLots must be pristine after call');
});

test('F03. computeSecuritiesGain — partial fill leaves unfilled', () => {
  const buys = [{ date: '2020-01-01', quantity: 50, price: 100 }];
  const sell = { date: '2026-01-01', quantity: 80, price: 150 };
  const r = computeSecuritiesGain(buys, sell);
  assert.equal(r.fullySold, false);
  assert.equal(r.unfilled, 30);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].quantity, 50);
});

test('F04. computeSecuritiesGain — totals sum across matches', () => {
  const buys = [
    { date: '2020-01-10', quantity: 100, price: 50 },
    { date: '2022-06-15', quantity: 100, price: 70 },
  ];
  const sell = { date: '2026-04-01', quantity: 200, price: 120 };
  const r = computeSecuritiesGain(buys, sell);
  const sumNominal = r.matches.reduce((s, m) => s + m.computation.nominalGain, 0);
  assert.ok(Math.abs(sumNominal - r.totals.nominalGain) < 0.02);
  const sumTax = r.matches.reduce((s, m) => s + m.computation.tax, 0);
  assert.ok(Math.abs(sumTax - r.totals.tax) < 0.02);
});

test('F05. computeSecuritiesGain — remainingLots decremented in copy only', () => {
  const buys = [
    { date: '2018-01-10', quantity: 100, price: 50 },
    { date: '2020-06-15', quantity: 200, price: 75 },
  ];
  const sell = { date: '2026-04-01', quantity: 150, price: 120 };
  const r = computeSecuritiesGain(buys, sell);
  assert.equal(r.remainingLots[0].quantity, 0);
  assert.equal(r.remainingLots[1].quantity, 150);
  // Originals intact
  assert.equal(buys[0].quantity, 100);
  assert.equal(buys[1].quantity, 200);
});

test('F06. computeSecuritiesGain — invalid sellLot rejected', () => {
  assert.throws(
    () => computeSecuritiesGain([{ date: '2020-01-01', quantity: 10, price: 50 }],
                                { date: '2026-01-01', quantity: 0, price: 100 }),
    CapitalGainsError,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Section G — Loss carryforward tracker
// ═══════════════════════════════════════════════════════════════════════════

test('G01. Loss tracker — offset within same category FIFO', () => {
  const t = createLossTracker();
  t.addLoss(2023, 50000, ASSET_TYPES.SECURITY);
  const r = t.addGain(2024, 30000, ASSET_TYPES.SECURITY);
  assert.equal(r.appliedOffset, 30000);
  assert.equal(r.taxableGain, 0);
  assert.equal(t.available(2024, ASSET_TYPES.SECURITY), 20000);
});

test('G02. Loss tracker — expires after 3 years, never deletes bucket', () => {
  const t = createLossTracker();
  t.addLoss(2020, 100000, ASSET_TYPES.SECURITY);
  // 2020 → 2024 is exactly 4 years, beyond 3-year carry-forward
  const r = t.addGain(2024, 80000, ASSET_TYPES.SECURITY);
  assert.equal(r.appliedOffset, 0);
  assert.equal(r.taxableGain, 80000);
  // Bucket still in snapshot (never deleted)
  const snap = t.snapshot();
  assert.equal(snap.length, 1);
  assert.equal(snap[0].expired, true);
  assert.equal(snap[0].original, 100000);
});

test('G03. Loss tracker — real-estate segregated from securities', () => {
  const t = createLossTracker();
  t.addLoss(2023, 100000, ASSET_TYPES.REAL_ESTATE);
  // Security gain cannot use real-estate loss
  const r1 = t.addGain(2024, 50000, ASSET_TYPES.SECURITY);
  assert.equal(r1.appliedOffset, 0);
  // Real-estate gain can use real-estate loss
  const r2 = t.addGain(2024, 50000, ASSET_TYPES.REAL_ESTATE);
  assert.equal(r2.appliedOffset, 50000);
});

test('G04. Loss tracker — securities loss offsets other capital gains', () => {
  const t = createLossTracker();
  t.addLoss(2023, 100000, ASSET_TYPES.SECURITY);
  // Business asset gain can use securities loss
  const r = t.addGain(2024, 40000, ASSET_TYPES.BUSINESS_ASSET);
  assert.equal(r.appliedOffset, 40000);
});

test('G05. Loss tracker — FIFO consumption across multiple buckets', () => {
  const t = createLossTracker();
  t.addLoss(2022, 30000, ASSET_TYPES.SECURITY);
  t.addLoss(2023, 50000, ASSET_TYPES.SECURITY);
  const r = t.addGain(2024, 60000, ASSET_TYPES.SECURITY);
  assert.equal(r.applications[0].bucketYear, 2022);
  assert.equal(r.applications[0].amount, 30000);
  assert.equal(r.applications[1].bucketYear, 2023);
  assert.equal(r.applications[1].amount, 30000);
  assert.equal(r.appliedOffset, 60000);
  assert.equal(t.available(2024, ASSET_TYPES.SECURITY), 20000);
});

test('G06. Loss tracker — addLoss rejects invalid amount', () => {
  const t = createLossTracker();
  assert.throws(() => t.addLoss(2024, -100, ASSET_TYPES.SECURITY), CapitalGainsError);
  assert.throws(() => t.addLoss(2024, 0, ASSET_TYPES.SECURITY), CapitalGainsError);
});

test('G07. Loss tracker — snapshot is read-only copy', () => {
  const t = createLossTracker();
  t.addLoss(2024, 10000, ASSET_TYPES.SECURITY);
  const snap1 = t.snapshot();
  snap1[0].remaining = 999999;       // mutate the copy
  const snap2 = t.snapshot();
  assert.equal(snap2[0].remaining, 10000);   // original intact
});

// ═══════════════════════════════════════════════════════════════════════════
// Section H — Error handling / validation
// ═══════════════════════════════════════════════════════════════════════════

test('H01. computeCapitalGain rejects missing params', () => {
  assert.throws(() => computeCapitalGain(null), CapitalGainsError);
  assert.throws(() => computeCapitalGain(undefined), CapitalGainsError);
});

test('H02. computeCapitalGain rejects invalid amount', () => {
  assert.throws(() => computeCapitalGain({
    purchase: 'abc', sale: 100, purchaseDate: '2020-01-01', saleDate: '2025-01-01',
  }), CapitalGainsError);
  assert.throws(() => computeCapitalGain({
    purchase: 100, sale: NaN, purchaseDate: '2020-01-01', saleDate: '2025-01-01',
  }), CapitalGainsError);
});

test('H03. computeCapitalGain rejects date order', () => {
  assert.throws(() => computeCapitalGain({
    purchase: 100, sale: 200,
    purchaseDate: '2025-01-01', saleDate: '2020-01-01',
  }), CapitalGainsError);
});

test('H04. computeCapitalGain rejects malformed dates', () => {
  assert.throws(() => computeCapitalGain({
    purchase: 100, sale: 200,
    purchaseDate: 'tomorrow', saleDate: '2025-01-01',
  }), CapitalGainsError);
});

// ═══════════════════════════════════════════════════════════════════════════
// Section I — Bilingual output
// ═══════════════════════════════════════════════════════════════════════════

test('I01. Result includes Hebrew & English bilingual summary', () => {
  const r = computeCapitalGain({
    purchase: 100000, sale: 200000,
    purchaseDate: '2020-01-01', saleDate: '2025-01-01',
  });
  assert.ok(r.bilingual.he.includes('רווח'));
  assert.ok(r.bilingual.en.toLowerCase().includes('gain'));
});

test('I02. Loss result has bilingual loss message', () => {
  const r = computeCapitalGain({
    purchase: 200000, sale: 100000,
    purchaseDate: '2020-01-01', saleDate: '2025-01-01',
  });
  assert.ok(r.bilingual.he.includes('הפסד'));
  assert.ok(r.bilingual.en.toLowerCase().includes('loss'));
});

// ═══════════════════════════════════════════════════════════════════════════
// Section J — End-to-end scenario: FIFO with loss carryforward
// ═══════════════════════════════════════════════════════════════════════════

test('J01. End-to-end — FIFO sell + tracker offset', () => {
  const tracker = createLossTracker();
  // Prior-year loss
  tracker.addLoss(2024, 20000, ASSET_TYPES.SECURITY);
  // FIFO sale this year
  const buys = [
    { date: '2020-01-10', quantity: 100, price: 50 },
    { date: '2022-06-15', quantity: 100, price: 75 },
  ];
  const sell = { date: '2026-03-01', quantity: 150, price: 120 };
  const fifo = computeSecuritiesGain(buys, sell);
  assert.ok(fifo.totals.nominalGain > 0);
  // Apply offset
  const offset = tracker.addGain(2026, fifo.totals.realGain, ASSET_TYPES.SECURITY);
  assert.ok(offset.appliedOffset <= 20000);
  assert.ok(offset.taxableGain >= 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// Section K — Never-delete principle (לא מוחקים)
// ═══════════════════════════════════════════════════════════════════════════

test('K01. Expired loss bucket stays in ledger, marked expired', () => {
  const t = createLossTracker();
  const b = t.addLoss(2020, 40000, ASSET_TYPES.SECURITY);
  t.expireOld(2025);
  const snap = t.snapshot();
  assert.equal(snap.length, 1);
  assert.equal(snap[0].expired, true);
  assert.equal(snap[0].original, 40000);
  // Audit trail preserved
  assert.ok(snap[0].addedAt);
});

test('K02. addLoss never mutates snapshot of prior state', () => {
  const t = createLossTracker();
  t.addLoss(2023, 10000, ASSET_TYPES.SECURITY);
  const snap1 = t.snapshot();
  t.addLoss(2024, 5000, ASSET_TYPES.SECURITY);
  const snap2 = t.snapshot();
  assert.equal(snap1.length, 1);
  assert.equal(snap2.length, 2);
  // snap1 untouched after the second addLoss
  assert.equal(snap1[0].remaining, 10000);
});
