/**
 * Deferred Revenue (IFRS 15) — test suite
 * Agent Y-090 — Mega-ERP Techno-Kol Uzi — Kobi EL
 *
 * Pure node:test — zero external deps.
 * Covers:
 *   • IFRS 15 five-step model, end-to-end
 *   • Price allocation on relative standalone-selling-price
 *   • Over-time recognition (output / input / cost-to-cost /
 *     units-delivered)
 *   • Point-in-time satisfaction
 *   • Contract modifications — separate / prospective / retrospective
 *   • Subscription scheduling (SaaS)
 *   • Deferred balance, unbilled receivable, contract liability
 *   • Roll-forward — opening + additions − recognized = closing
 *   • Disclosure report (backlog, VAT reconciliation, cash-basis)
 *   • Israeli VAT reconciliation (billed vs recognized)
 *   • "Never delete" rule — modifications preserve history
 *   • Bilingual error messages
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DeferredRevenue,
  DeferredRevenueError,
  CONSTANTS,
  RECOGNITION_METHODS,
  TIMING_TYPES,
  MODIFICATION_TYPES,
  EVENT_TYPES,
  MODES,
  toAgorot,
  toShekels,
} = require('../../src/finance/deferred-revenue.js');

/* ---------- helpers ---------- */

function sampleMultiPO() {
  return {
    customerId: 'CUST-100',
    total: 10000,
    performanceObligations: [
      { id: 'license',  description: 'Software license',   standaloneSSP: 6000, timing: 'point' },
      { id: 'support',  description: '12-month support',   standaloneSSP: 3000, timing: 'over-time' },
      { id: 'training', description: 'Training day',       standaloneSSP: 2000, timing: 'point' },
    ],
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  };
}

/* ---------- constants sanity ---------- */

test('CONSTANTS — exported and sane', () => {
  assert.equal(typeof CONSTANTS.VERSION, 'string');
  assert.equal(CONSTANTS.AGENT, 'Y-090');
  assert.equal(CONSTANTS.VAT_RATE_2026, 0.18);
  assert.equal(RECOGNITION_METHODS.OUTPUT, 'output');
  assert.equal(RECOGNITION_METHODS.COST_TO_COST, 'cost-to-cost');
  assert.equal(TIMING_TYPES.POINT, 'point');
  assert.equal(TIMING_TYPES.OVER_TIME, 'over-time');
  assert.equal(MODIFICATION_TYPES.SEPARATE, 'separate');
  assert.equal(MODIFICATION_TYPES.PROSPECTIVE, 'prospective');
  assert.equal(MODIFICATION_TYPES.RETROSPECTIVE, 'retrospective');
});

/* ---------- integer-agorot ---------- */

test('toAgorot / toShekels — round-trip', () => {
  assert.equal(toAgorot(12.34), 1234);
  assert.equal(toAgorot(0.1 + 0.2), 30);
  assert.equal(toShekels(1234), 12.34);
  assert.equal(toShekels(toAgorot(99.99)), 99.99);
});

/* ---------- Step 1: createContract validation ---------- */

test('createContract — validates required fields (bilingual)', () => {
  const dr = new DeferredRevenue();
  assert.throws(() => dr.createContract({}), /customerId is required/);
  assert.throws(
    () => dr.createContract({ customerId: 'X', total: -1, performanceObligations: [{}] }),
    /total must be a non-negative/
  );
  try {
    dr.createContract({ customerId: 'X', total: 100, performanceObligations: [] });
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof DeferredRevenueError);
    assert.ok(e.he && e.en);
    assert.match(e.he, /מחויבות/);
  }
});

test('createContract — endDate before startDate rejected', () => {
  const dr = new DeferredRevenue();
  assert.throws(
    () => dr.createContract({
      customerId: 'X',
      total: 100,
      performanceObligations: [{ id: 'a', standaloneSSP: 100, timing: 'point' }],
      startDate: '2026-02-01',
      endDate: '2026-01-01',
    }),
    /endDate must be on or after startDate/
  );
});

test('createContract — creates contract with auto-generated ID and event log', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  assert.ok(c.id.startsWith('CT-'));
  assert.equal(c.customerId, 'CUST-100');
  assert.equal(c.totalAgorot, toAgorot(10000));
  assert.equal(c.performanceObligations.length, 3);
  assert.equal(c.version, 1);
  assert.equal(c.status, 'active');
  assert.ok(c.events.find(e => e.type === EVENT_TYPES.CREATED));
  assert.ok(c.events.find(e => e.type === EVENT_TYPES.PRICE_ALLOCATED));
});

/* ---------- Step 4: allocatePrice ---------- */

test('allocatePrice — relative SSP, sum matches transaction price exactly', () => {
  const dr = new DeferredRevenue();
  const res = dr.allocatePrice({
    transactionPrice: 10000,
    obligations: [
      { id: 'a', standaloneSSP: 6000 },
      { id: 'b', standaloneSSP: 3000 },
      { id: 'c', standaloneSSP: 2000 },
    ],
  });
  const sum = res.allocations.reduce((s, a) => s + a.allocatedAgorot, 0);
  assert.equal(sum, toAgorot(10000));
  // Each allocation proportional to SSP (total SSP = 11000 → ratios 6/11, 3/11, 2/11)
  assert.equal(res.allocations[0].id, 'a');
  assert.equal(res.allocations[1].id, 'b');
  assert.equal(res.allocations[2].id, 'c');
  assert.equal(res.method, 'relative-SSP');
});

test('allocatePrice — rounding residue absorbed on last obligation', () => {
  const dr = new DeferredRevenue();
  const res = dr.allocatePrice({
    transactionPrice: 100,
    obligations: [
      { id: 'a', standaloneSSP: 1 },
      { id: 'b', standaloneSSP: 1 },
      { id: 'c', standaloneSSP: 1 },
    ],
  });
  const sum = res.allocations.reduce((s, a) => s + a.allocatedAgorot, 0);
  assert.equal(sum, toAgorot(100));
});

test('allocatePrice — zero total SSP falls back to even split', () => {
  const dr = new DeferredRevenue();
  const res = dr.allocatePrice({
    transactionPrice: 90,
    obligations: [
      { id: 'a', standaloneSSP: 0 },
      { id: 'b', standaloneSSP: 0 },
      { id: 'c', standaloneSSP: 0 },
    ],
  });
  assert.equal(res.method, 'even-split');
  const sum = res.allocations.reduce((s, a) => s + a.allocatedAgorot, 0);
  assert.equal(sum, toAgorot(90));
});

test('allocatePrice — contract with discount (total < sum SSP)', () => {
  // License SSP 6000, support SSP 3000, training SSP 2000 = 11,000.
  // Contract sold at 10,000 — 9.09% bundle discount allocated on
  // relative SSP.
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  const license = c.performanceObligations.find(o => o.id === 'license');
  const support = c.performanceObligations.find(o => o.id === 'support');
  const training = c.performanceObligations.find(o => o.id === 'training');
  // License ratio 6000/11000 * 10000 = 5454.54 → allocated 5454.54
  assert.ok(license.allocatedAgorot < license.standaloneSSPAgorot);
  assert.ok(support.allocatedAgorot < support.standaloneSSPAgorot);
  assert.ok(training.allocatedAgorot <= training.standaloneSSPAgorot);
  const sum = license.allocatedAgorot + support.allocatedAgorot + training.allocatedAgorot;
  assert.equal(sum, toAgorot(10000));
});

/* ---------- Step 5a: Over-time — output/input/cost-to-cost ---------- */

test('recognizeRevenue — output method with percentComplete', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  // Recognize 50% of support
  const res1 = dr.recognizeRevenue({
    contractId: c.id,
    obligationId: 'support',
    percentComplete: 0.5,
    method: 'output',
    date: '2026-06-30',
  });
  // Support allocated ~2727.27 — 50% = 1363 ₪-ish
  assert.ok(res1.cumulativeAgorot > 0);
  const support = dr.getContract(c.id).performanceObligations.find(o => o.id === 'support');
  assert.ok(Math.abs(support.recognizedAgorot - Math.floor(support.allocatedAgorot * 0.5)) < 2);

  // Recognize another 50% → fully recognized
  const res2 = dr.recognizeRevenue({
    contractId: c.id,
    obligationId: 'support',
    percentComplete: 1.0,
    method: 'output',
    date: '2026-12-31',
  });
  const support2 = dr.getContract(c.id).performanceObligations.find(o => o.id === 'support');
  assert.equal(support2.recognizedAgorot, support2.allocatedAgorot);
  assert.equal(support2.satisfied, true);
});

test('recognizeRevenue — cost-to-cost method', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'C1', total: 1000,
    performanceObligations: [
      { id: 'project', description: 'Build project', standaloneSSP: 1000, timing: 'over-time' },
    ],
  });
  // 60 of 200 expected cost incurred → 30% recognized = ₪300
  const res = dr.recognizeRevenue({
    contractId: c.id,
    obligationId: 'project',
    incurredCost: 60,
    totalExpectedCost: 200,
    method: 'cost-to-cost',
  });
  assert.equal(res.cumulativeAgorot, toAgorot(300));
  assert.equal(res.recognizedAgorot, toAgorot(300));

  // Additional cost 140 → cumulative cost 200 → 100% recognized
  const res2 = dr.recognizeRevenue({
    contractId: c.id,
    obligationId: 'project',
    incurredCost: 200,
    totalExpectedCost: 200,
    method: 'cost-to-cost',
  });
  assert.equal(res2.cumulativeAgorot, toAgorot(1000));
  assert.equal(res2.recognizedAgorot, toAgorot(700));
});

test('recognizeRevenue — units-delivered method', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'C2', total: 500,
    performanceObligations: [
      { id: 'units', standaloneSSP: 500, timing: 'over-time' },
    ],
  });
  const res = dr.recognizeRevenue({
    contractId: c.id,
    obligationId: 'units',
    unitsDelivered: 25,
    totalUnits: 100,
    method: 'units-delivered',
  });
  assert.equal(res.cumulativeAgorot, toAgorot(125));
});

test('recognizeRevenue — over-time rejects point-in-time obligation', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  assert.throws(
    () => dr.recognizeRevenue({
      contractId: c.id,
      obligationId: 'license',
      percentComplete: 0.5,
      method: 'output',
    }),
    /point-in-time obligation/
  );
});

test('recognizeRevenue — cost-to-cost missing inputs throws bilingual error', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'C3', total: 100,
    performanceObligations: [{ id: 'x', standaloneSSP: 100, timing: 'over-time' }],
  });
  try {
    dr.recognizeRevenue({
      contractId: c.id, obligationId: 'x',
      method: 'cost-to-cost',
    });
    assert.fail('should throw');
  } catch (e) {
    assert.match(e.he, /cost-to-cost/);
    assert.match(e.en, /cost-to-cost/);
  }
});

test('recognizeRevenue — cumulative recognition caps at allocated', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'C4', total: 100,
    performanceObligations: [{ id: 'x', standaloneSSP: 100, timing: 'over-time' }],
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    percentComplete: 0.9,
    method: 'output',
  });
  const res = dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    percentComplete: 2.0,   // clamped to 1.0
    method: 'output',
  });
  const po = dr.getContract(c.id).performanceObligations[0];
  assert.equal(po.recognizedAgorot, po.allocatedAgorot);
});

/* ---------- Step 5b: point-in-time ---------- */

test('satisfyObligation — point-in-time recognizes full allocated amount', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  const before = dr.getContract(c.id).performanceObligations.find(o => o.id === 'license');
  const res = dr.satisfyObligation({
    contractId: c.id,
    obligationId: 'license',
    date: '2026-02-15',
    proof: { deliveryNote: 'DN-42', signedBy: 'K. EL' },
  });
  const after = res.contract.performanceObligations.find(o => o.id === 'license');
  assert.equal(after.recognizedAgorot, before.allocatedAgorot);
  assert.equal(after.satisfied, true);
  assert.equal(after.satisfiedDate, '2026-02-15');
  assert.equal(after.satisfiedProof.deliveryNote, 'DN-42');
});

test('satisfyObligation — rejects double satisfaction (bilingual error)', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  dr.satisfyObligation({ contractId: c.id, obligationId: 'license' });
  try {
    dr.satisfyObligation({ contractId: c.id, obligationId: 'license' });
    assert.fail('should throw');
  } catch (e) {
    assert.match(e.he, /כבר קויימה/);
    assert.match(e.en, /already satisfied/);
  }
});

test('satisfyObligation — rejects over-time obligations', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  assert.throws(
    () => dr.satisfyObligation({ contractId: c.id, obligationId: 'support' }),
    /point-in-time obligations only/
  );
});

/* ---------- Subscriptions / SaaS ---------- */

test('scheduleSubscription — monthly, 12 periods', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'SaaS1', total: 1200,
    performanceObligations: [
      { id: 'saas', standaloneSSP: 1200, timing: 'over-time' },
    ],
    startDate: '2026-01-01',
  });
  const sch = dr.scheduleSubscription({
    contractId: c.id,
    obligationId: 'saas',
    period: 'monthly',
    amount: 100,
    recurring: 12,
    startDate: '2026-01-01',
  });
  assert.equal(sch.schedule.length, 12);
  assert.equal(sch.schedule[0].period, '2026-01');
  assert.equal(sch.schedule[11].period, '2026-12');
  assert.equal(sch.schedule[0].amountAgorot, toAgorot(100));
  assert.equal(sch.totalAgorot, toAgorot(1200));
});

test('scheduleSubscription — quarterly, 4 periods', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'SaaS2', total: 4000,
    performanceObligations: [
      { id: 'saas', standaloneSSP: 4000, timing: 'over-time' },
    ],
    startDate: '2026-01-01',
  });
  const sch = dr.scheduleSubscription({
    contractId: c.id, obligationId: 'saas',
    period: 'quarterly', amount: 1000, recurring: 4,
    startDate: '2026-01-01',
  });
  assert.equal(sch.schedule.length, 4);
  assert.equal(sch.schedule[0].period, '2026-01');
  assert.equal(sch.schedule[1].period, '2026-04');
  assert.equal(sch.schedule[2].period, '2026-07');
  assert.equal(sch.schedule[3].period, '2026-10');
});

test('scheduleSubscription — rejects invalid period', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'X', total: 100,
    performanceObligations: [{ id: 'a', standaloneSSP: 100, timing: 'over-time' }],
  });
  assert.throws(
    () => dr.scheduleSubscription({
      contractId: c.id, obligationId: 'a',
      period: 'weekly', amount: 10, recurring: 5,
    }),
    /Unsupported subscription period/
  );
});

/* ---------- Contract modifications ---------- */

test('modifyContract — SEPARATE adds new obligation, preserves old ones', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  const before = dr.getContract(c.id);
  const beforeCount = before.performanceObligations.length;
  const beforeLicense = before.performanceObligations.find(o => o.id === 'license');
  const res = dr.modifyContract({
    contractId: c.id,
    modificationType: 'separate',
    impact: {
      additionalPrice: 500,
      newObligations: [
        { id: 'addon', description: 'API add-on', standaloneSSP: 500, timing: 'point' },
      ],
    },
  });
  const after = dr.getContract(c.id);
  assert.equal(after.performanceObligations.length, beforeCount + 1);
  assert.equal(after.version, 2);
  // old license allocation is untouched
  const afterLicense = after.performanceObligations.find(o => o.id === 'license');
  assert.equal(afterLicense.allocatedAgorot, beforeLicense.allocatedAgorot);
  // history preserved
  assert.equal(after.history.length, 1);
  assert.equal(after.history[0].version, 1);
  // total increased by 500
  assert.equal(after.totalAgorot, before.totalAgorot + toAgorot(500));
});

test('modifyContract — PROSPECTIVE re-allocates remaining + new obligations', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  // Satisfy license first
  dr.satisfyObligation({ contractId: c.id, obligationId: 'license' });
  const before = dr.getContract(c.id);
  const beforeSupport = before.performanceObligations.find(o => o.id === 'support');
  // Prospective mod: add 2000 and a new obligation
  const res = dr.modifyContract({
    contractId: c.id,
    modificationType: 'prospective',
    impact: {
      additionalPrice: 2000,
      newObligations: [
        { id: 'premium', description: 'Premium support tier', standaloneSSP: 1500, timing: 'over-time' },
      ],
    },
  });
  const after = dr.getContract(c.id);
  // License recognition preserved (already satisfied)
  const afterLicense = after.performanceObligations.find(o => o.id === 'license');
  assert.equal(afterLicense.satisfied, true);
  assert.equal(afterLicense.recognizedAgorot, afterLicense.allocatedAgorot);
  // Support's allocation should have changed (re-allocation)
  const afterSupport = after.performanceObligations.find(o => o.id === 'support');
  assert.notEqual(afterSupport.allocatedAgorot, beforeSupport.allocatedAgorot);
  // Total increased
  assert.equal(after.totalAgorot, before.totalAgorot + toAgorot(2000));
  // New obligation exists
  assert.ok(after.performanceObligations.find(o => o.id === 'premium'));
  assert.equal(after.version, 2);
  assert.equal(after.history.length, 1);
});

test('modifyContract — RETROSPECTIVE books cumulative catch-up', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'C5', total: 1000,
    performanceObligations: [
      { id: 'x', standaloneSSP: 1000, timing: 'over-time' },
    ],
  });
  // Recognize 40% first
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    percentComplete: 0.4, method: 'output',
  });
  const before = dr.getContract(c.id);
  assert.equal(before.performanceObligations[0].recognizedAgorot, toAgorot(400));

  // Retrospective mod: revised total from 1000 to 1500. Progress
  // is 40%, so cumulative should be bumped to 600 → catch-up 200.
  const res = dr.modifyContract({
    contractId: c.id,
    modificationType: 'retrospective',
    impact: { revisedTotal: 1500 },
  });
  const after = dr.getContract(c.id);
  assert.equal(after.performanceObligations[0].allocatedAgorot, toAgorot(1500));
  assert.equal(after.performanceObligations[0].recognizedAgorot, toAgorot(600));
  assert.equal(res.catchUpAgorot, toAgorot(200));
  assert.equal(after.version, 2);
  assert.equal(after.history.length, 1);
});

test('modifyContract — invalid type rejected with bilingual error', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  try {
    dr.modifyContract({ contractId: c.id, modificationType: 'bogus' });
    assert.fail('should throw');
  } catch (e) {
    assert.match(e.he, /סוג שינוי לא נתמך/);
    assert.match(e.en, /Unsupported modification type/);
  }
});

test('modifyContract — history[] is append-only (never delete)', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  dr.modifyContract({
    contractId: c.id, modificationType: 'separate',
    impact: { additionalPrice: 100, newObligations: [{ id: 'z1', standaloneSSP: 100, timing: 'point' }] },
  });
  dr.modifyContract({
    contractId: c.id, modificationType: 'separate',
    impact: { additionalPrice: 200, newObligations: [{ id: 'z2', standaloneSSP: 200, timing: 'point' }] },
  });
  const after = dr.getContract(c.id);
  assert.equal(after.history.length, 2);
  assert.equal(after.history[0].version, 1);
  assert.equal(after.history[1].version, 2);
  assert.equal(after.version, 3);
});

/* ---------- Balance functions ---------- */

test('deferredBalance — unearned revenue outstanding', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'D1', total: 1200,
    performanceObligations: [{ id: 'saas', standaloneSSP: 1200, timing: 'over-time' }],
    startDate: '2026-01-01',
  });
  // Recognize 25%
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'saas',
    percentComplete: 0.25, method: 'output',
    date: '2026-03-31',
  });
  // As of end of March — deferred = 1200 − 300 = 900
  const bal = dr.deferredBalance(c.id, '2026-03-31');
  assert.equal(bal, 900);
});

test('contractLiability — when billing > recognition', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'L1', total: 1000,
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  // Bill 1000 upfront
  dr.recordBilling({
    contractId: c.id, obligationId: 'x',
    amount: 1000, date: '2026-01-15', invoice: 'INV-001',
  });
  // Recognize only 200
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    amount: 200, method: 'output', date: '2026-02-28',
  });
  assert.equal(dr.contractLiability(c.id), 800);
  assert.equal(dr.unbilledReceivable(c.id), 0);
});

test('unbilledReceivable — when recognition > billing', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'U1', total: 1000,
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    amount: 500, method: 'output', date: '2026-02-28',
  });
  // Bill only 100
  dr.recordBilling({
    contractId: c.id, obligationId: 'x',
    amount: 100, date: '2026-03-01', invoice: 'INV-002',
  });
  assert.equal(dr.unbilledReceivable(c.id), 400);
  assert.equal(dr.contractLiability(c.id), 0);
});

/* ---------- Roll-forward ---------- */

test('rolloForward — opening + additions − recognized = closing', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'R1', total: 1200,
    performanceObligations: [{ id: 'saas', standaloneSSP: 1200, timing: 'over-time' }],
  });
  // Prior period: bill 1200 in December 2025
  dr.recordBilling({
    contractId: c.id, obligationId: 'saas',
    amount: 1200, date: '2025-12-31', invoice: 'INV-P0',
  });
  // January 2026: recognize 100
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'saas',
    amount: 100, method: 'output', date: '2026-01-31',
  });
  const rf = dr.rolloForward('2026-01');
  // Opening = 1200 (billed in 2025-12, nothing recognized yet)
  assert.equal(rf.opening, 1200);
  assert.equal(rf.additions, 0);
  assert.equal(rf.recognized, 100);
  assert.equal(rf.closing, 1100);
  assert.equal(rf.formula_en, 'opening + additions − recognized = closing');
  assert.equal(rf.byContract.length, 1);
  assert.equal(rf.byContract[0].contractId, c.id);
});

test('rolloForward — multiple contracts aggregate', () => {
  const dr = new DeferredRevenue();
  const c1 = dr.createContract({
    customerId: 'A', total: 1000,
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  const c2 = dr.createContract({
    customerId: 'B', total: 2000,
    performanceObligations: [{ id: 'y', standaloneSSP: 2000, timing: 'over-time' }],
  });
  dr.recordBilling({ contractId: c1.id, obligationId: 'x', amount: 1000, date: '2026-02-01', invoice: 'A-1' });
  dr.recordBilling({ contractId: c2.id, obligationId: 'y', amount: 2000, date: '2026-02-15', invoice: 'B-1' });
  dr.recognizeRevenue({ contractId: c1.id, obligationId: 'x', amount: 400, method: 'output', date: '2026-02-28' });

  const rf = dr.rolloForward('2026-02');
  assert.equal(rf.additions, 3000);
  assert.equal(rf.recognized, 400);
  assert.equal(rf.closing, 2600);
  assert.equal(rf.byContract.length, 2);
});

/* ---------- Disclosure report + Israeli VAT ---------- */

test('disclosureReport — bilingual keys + backlog + VAT reconciliation', () => {
  const dr = new DeferredRevenue({ mode: 'accrual' });
  const c = dr.createContract({
    customerId: 'D-ISR', total: 10000,
    performanceObligations: [
      { id: 'lic', standaloneSSP: 6000, timing: 'point' },
      { id: 'saas', standaloneSSP: 4000, timing: 'over-time' },
    ],
    startDate: '2026-01-01', endDate: '2026-12-31',
  });
  dr.satisfyObligation({ contractId: c.id, obligationId: 'lic', date: '2026-01-15' });
  dr.recordBilling({ contractId: c.id, obligationId: 'lic', amount: 6000, date: '2026-01-15', invoice: 'INV-A' });
  dr.recordBilling({ contractId: c.id, obligationId: 'saas', amount: 4000, date: '2026-01-31', invoice: 'INV-B' });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'saas',
    percentComplete: 0.25, method: 'output', date: '2026-03-31',
  });

  const rep = dr.disclosureReport('2026');
  assert.ok(rep.he);
  assert.ok(rep.en);
  assert.match(rep.he.title, /IFRS 15/);
  assert.match(rep.he.title, /תקופה/);
  assert.match(rep.en.title, /IFRS 15 Disclosure Report/);
  // Backlog = total − cumulative recognized = 10000 − (6000 + 1000) = 3000
  assert.equal(rep.totals.backlog, 3000);
  // VAT reconciliation — billed 10000, recognized 7000, gap 3000,
  // vat on billed @ 18% = 1800
  assert.equal(rep.vatReconciliation.billed, 10000);
  assert.equal(rep.vatReconciliation.recognized, 7000);
  assert.equal(rep.vatReconciliation.gap, 3000);
  assert.equal(rep.vatReconciliation.vatPayable, 1800);
  assert.equal(rep.vatReconciliation.vatRate, 0.18);
  assert.match(rep.vatReconciliation.note_he, /חשבונית/);
  assert.match(rep.vatReconciliation.note_en, /tax-invoice/);
  assert.equal(rep.cashBasisTaxable, null); // accrual mode
});

test('disclosureReport — cash-basis mode returns cashBasisTaxable', () => {
  const dr = new DeferredRevenue({ mode: 'cash-basis' });
  const c = dr.createContract({
    customerId: 'CB', total: 1000,
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  dr.recordBilling({ contractId: c.id, obligationId: 'x', amount: 1000, date: '2026-05-01', invoice: 'INV-C' });
  const rep = dr.disclosureReport('2026');
  assert.equal(rep.mode, 'cash-basis');
  assert.equal(rep.cashBasisTaxable, 1000);
});

test('VAT reconciliation — billed > recognized generates positive gap', () => {
  // Demonstrates the Israeli-specific case: invoice issued before
  // revenue recognized under IFRS 15.
  const dr = new DeferredRevenue();
  const c = dr.createContract({
    customerId: 'VAT1', total: 12000,
    performanceObligations: [{ id: 'annual', standaloneSSP: 12000, timing: 'over-time' }],
  });
  dr.recordBilling({ contractId: c.id, obligationId: 'annual', amount: 12000, date: '2026-01-01', invoice: 'INV-VAT' });
  // Only one month recognized out of twelve
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'annual',
    amount: 1000, method: 'output', date: '2026-01-31',
  });
  const rep = dr.disclosureReport('2026-01');
  // VAT on billed = 18% of 12000 = 2160 → must be paid regardless
  assert.equal(rep.vatReconciliation.billed, 12000);
  assert.equal(rep.vatReconciliation.recognized, 1000);
  assert.equal(rep.vatReconciliation.gap, 11000);
  assert.equal(rep.vatReconciliation.vatPayable, 2160);
});

/* ---------- IFRS 15 end-to-end compliance ---------- */

test('IFRS 15 five-step model — end-to-end integration', () => {
  const dr = new DeferredRevenue();
  // Step 1 — identify contract
  const c = dr.createContract({
    customerId: 'E2E',
    total: 15000,
    performanceObligations: [
      // Step 2 — identify obligations
      { id: 'hardware', description: 'Server hardware', standaloneSSP: 8000, timing: 'point' },
      { id: 'setup', description: 'One-time setup', standaloneSSP: 2000, timing: 'point' },
      { id: 'maintenance', description: '12-month maintenance', standaloneSSP: 6000, timing: 'over-time' },
    ],
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  });
  // Step 3 — transaction price already set (15000)
  // Step 4 — verify allocations sum to transaction price
  const sum = c.performanceObligations.reduce((s, o) => s + o.allocatedAgorot, 0);
  assert.equal(sum, toAgorot(15000));

  // Step 5a — satisfy point-in-time
  dr.satisfyObligation({ contractId: c.id, obligationId: 'hardware', date: '2026-01-10', proof: { dn: 'DN-1' } });
  dr.satisfyObligation({ contractId: c.id, obligationId: 'setup', date: '2026-01-15', proof: { dn: 'DN-2' } });

  // Step 5b — over-time maintenance, monthly
  for (let m = 1; m <= 12; m += 1) {
    dr.recognizeRevenue({
      contractId: c.id, obligationId: 'maintenance',
      percentComplete: m / 12,
      method: 'output',
      date: `2026-${String(m).padStart(2, '0')}-28`,
    });
  }
  const final = dr.getContract(c.id);
  const totalRecognized = final.performanceObligations.reduce((s, o) => s + o.recognizedAgorot, 0);
  assert.equal(totalRecognized, toAgorot(15000));
  assert.ok(final.performanceObligations.every(o => o.satisfied));

  // Deferred balance at year-end = 0
  assert.equal(dr.deferredBalance(c.id, '2026-12-31'), 0);
});

/* ---------- Query ---------- */

test('getContract / listContracts — returns deep clones', () => {
  const dr = new DeferredRevenue();
  const c = dr.createContract(sampleMultiPO());
  const got = dr.getContract(c.id);
  got.customerId = 'TAMPERED';
  const again = dr.getContract(c.id);
  assert.notEqual(again.customerId, 'TAMPERED');
  assert.equal(again.customerId, 'CUST-100');
  const all = dr.listContracts();
  assert.equal(all.length, 1);
});

test('getContract — missing returns null; _mustGetContract throws bilingual', () => {
  const dr = new DeferredRevenue();
  assert.equal(dr.getContract('NOPE'), null);
  assert.throws(
    () => dr.recognizeRevenue({ contractId: 'NOPE', obligationId: 'x', amount: 1, method: 'output' }),
    /Contract NOPE not found/
  );
});

/* ==============================================================
 * Upgrade v1.1 — spec-aligned API coverage (Agent Y-090)
 * ============================================================ */

/* ---------- Step 1: identifyContract ---------- */

test('v1.1 Step 1 — identifyContract creates contract with signedDate', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SPEC-1',
    totalAmount: 12000,
    signedDate: '2026-02-01',
    startDate: '2026-02-01',
    endDate: '2027-01-31',
    performanceObligations: [
      { id: 'license', standaloneSSP: 8000, timing: 'point' },
      { id: 'support', standaloneSSP: 4000, timing: 'over-time' },
    ],
  });
  assert.equal(c.customerId, 'SPEC-1');
  assert.equal(c.totalAgorot, toAgorot(12000));
  assert.equal(c.signedDate, '2026-02-01');
  assert.equal(c.step1_identified, true);
  assert.equal(c.performanceObligations.length, 2);
});

/* ---------- Step 2: identifyPerformanceObligations ---------- */

test('v1.1 Step 2 — identifyPerformanceObligations lists distinct POs', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SPEC-2',
    totalAmount: 10000,
    signedDate: '2026-01-01',
    performanceObligations: [
      { id: 'lic', description: 'License', standaloneSSP: 6000, timing: 'point' },
      { id: 'sup', description: 'Support', standaloneSSP: 3000, timing: 'over-time' },
      { id: 'trn', description: 'Training', standaloneSSP: 2000, timing: 'point' },
    ],
  });
  const pos = dr.identifyPerformanceObligations(c.id);
  assert.equal(pos.length, 3);
  assert.equal(pos[0].id, 'lic');
  assert.equal(pos[0].timing, 'point');
  assert.equal(pos[1].timing, 'over-time');
  assert.ok(pos.every(p => typeof p.allocatedAmount === 'number'));
});

/* ---------- Step 3: determineTransactionPrice ---------- */

test('v1.1 Step 3 — determineTransactionPrice adjusts for variable consideration', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SPEC-3',
    totalAmount: 10000,
    signedDate: '2026-01-01',
    performanceObligations: [
      { id: 'svc', standaloneSSP: 10000, timing: 'over-time' },
    ],
  });
  // -500 rebate + 200 financing adjustment = -300 net
  const res = dr.determineTransactionPrice(c.id, {
    variableConsideration: -500,
    financingComponent: 200,
    note: 'Q1 rebate offset',
  });
  assert.equal(res.adjustmentAgorot, toAgorot(-300));
  assert.equal(res.totalAgorot, toAgorot(9700));
  const after = dr.getContract(c.id);
  assert.equal(after.totalAgorot, toAgorot(9700));
  assert.equal(after.priceAdjustments.length, 1);
});

/* ---------- Step 4: allocateTransactionPrice — relative-SSP ---------- */

test('v1.1 Step 4 — allocateTransactionPrice relative-SSP method', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SPEC-4A',
    totalAmount: 10000,
    signedDate: '2026-01-01',
    performanceObligations: [
      { id: 'a', standaloneSSP: 4000, timing: 'point' },
      { id: 'b', standaloneSSP: 4000, timing: 'point' },
      { id: 'c', standaloneSSP: 2000, timing: 'point' },
    ],
  });
  const res = dr.allocateTransactionPrice(c.id, 'relative-SSP');
  assert.equal(res.method, 'relative-SSP');
  const sum = res.allocations.reduce((s, a) => s + a.allocatedAgorot, 0);
  assert.equal(sum, toAgorot(10000));
});

/* ---------- Step 4: allocateTransactionPrice — residual ---------- */

test('v1.1 Step 4 — allocateTransactionPrice residual method', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SPEC-4B',
    totalAmount: 10000,
    signedDate: '2026-01-01',
    performanceObligations: [
      // Two observable SSPs, one residual PO (last, receives residue)
      { id: 'hw', standaloneSSP: 6000, timing: 'point' },
      { id: 'svc', standaloneSSP: 2000, timing: 'point' },
      { id: 'custom', standaloneSSP: 0, timing: 'point' }, // residual bucket
    ],
  });
  const res = dr.allocateTransactionPrice(c.id, 'residual');
  assert.equal(res.method, 'residual');
  // hw @ 6000, svc @ 2000, residual = 10000 - 8000 = 2000
  const byId = Object.fromEntries(res.allocations.map(a => [a.id, a.allocatedAgorot]));
  assert.equal(byId.hw, toAgorot(6000));
  assert.equal(byId.svc, toAgorot(2000));
  assert.equal(byId.custom, toAgorot(2000));
});

test('v1.1 Step 4 — allocateTransactionPrice rejects invalid method bilingually', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SPEC-4C',
    totalAmount: 100,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'x', standaloneSSP: 100, timing: 'point' }],
  });
  try {
    dr.allocateTransactionPrice(c.id, 'bogus');
    assert.fail('should throw');
  } catch (e) {
    assert.match(e.he, /הקצאה/);
    assert.match(e.en, /Unsupported allocation method/);
  }
});

/* ---------- Straight-line recognition ---------- */

test('v1.1 Step 5 — straightLineRecognition for 12-month license', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SL-1',
    totalAmount: 1200,
    signedDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    performanceObligations: [
      { id: 'annual-license', standaloneSSP: 1200, timing: 'over-time' },
    ],
  });
  // Recognize Jan — should be ₪100
  const jan = dr.straightLineRecognition(
    { contractId: c.id, obligationId: 'annual-license' },
    '2026-01'
  );
  assert.equal(jan.amountAgorot, toAgorot(100));
  assert.equal(jan.totalMonths, 12);
  // Recognize each remaining month
  for (let m = 2; m <= 12; m += 1) {
    dr.straightLineRecognition(
      { contractId: c.id, obligationId: 'annual-license' },
      `2026-${String(m).padStart(2, '0')}`
    );
  }
  const po = dr.getContract(c.id).performanceObligations[0];
  assert.equal(po.recognizedAgorot, toAgorot(1200));
  assert.equal(po.satisfied, true);
});

test('v1.1 straightLineRecognition rejects out-of-range period', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'SL-2',
    totalAmount: 600,
    signedDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    performanceObligations: [
      { id: 'half', standaloneSSP: 600, timing: 'over-time' },
    ],
  });
  assert.throws(
    () => dr.straightLineRecognition(
      { contractId: c.id, obligationId: 'half' },
      '2026-12'
    ),
    /outside contract range/
  );
});

/* ---------- Percentage-of-completion (POC) ---------- */

test('v1.1 Step 5 — percentageOfCompletion for construction project', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'POC-1',
    totalAmount: 1000000,
    signedDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: '2027-12-31',
    performanceObligations: [
      { id: 'build', standaloneSSP: 1000000, timing: 'over-time' },
    ],
  });
  // 150k of 600k total → 25% complete → recognize 250k
  const r1 = dr.percentageOfCompletion(
    { contractId: c.id, obligationId: 'build' },
    { incurredCost: 150000, totalExpectedCost: 600000, date: '2026-06-30' }
  );
  assert.equal(r1.percentageStr, '25.00%');
  assert.equal(r1.cumulativeAgorot, toAgorot(250000));
  // 450k of 600k → 75% → cumulative 750k, delta 500k
  const r2 = dr.percentageOfCompletion(
    { contractId: c.id, obligationId: 'build' },
    { incurredCost: 450000, totalExpectedCost: 600000, date: '2026-12-31' }
  );
  assert.equal(r2.cumulativeAgorot, toAgorot(750000));
  assert.equal(r2.recognizedAgorot, toAgorot(500000));
});

/* ---------- Milestone recognition ---------- */

test('v1.1 Step 5 — milestoneRecognition with explicit amounts', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'MS-1',
    totalAmount: 3000,
    signedDate: '2026-01-01',
    performanceObligations: [
      { id: 'project', standaloneSSP: 3000, timing: 'over-time' },
    ],
  });
  const res = dr.milestoneRecognition(
    { contractId: c.id, obligationId: 'project' },
    [
      { id: 'M1', name: 'Kickoff',    complete: true,  amount: 500, date: '2026-02-01' },
      { id: 'M2', name: 'Design',     complete: true,  amount: 1000, date: '2026-04-01' },
      { id: 'M3', name: 'Final',      complete: false, amount: 1500 },
    ]
  );
  assert.equal(res.milestonesCompleted, 2);
  assert.equal(res.recognizedAgorot, toAgorot(1500));
  const po = dr.getContract(c.id).performanceObligations[0];
  assert.equal(po.recognizedAgorot, toAgorot(1500));
  assert.equal(po.milestones.length, 2);
});

test('v1.1 milestoneRecognition by weight', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'MS-2',
    totalAmount: 4000,
    signedDate: '2026-01-01',
    performanceObligations: [
      { id: 'project', standaloneSSP: 4000, timing: 'over-time' },
    ],
  });
  const res = dr.milestoneRecognition(
    { contractId: c.id, obligationId: 'project' },
    [
      { id: 'M1', complete: true, weight: 1 },  // 1/4 * 4000 = 1000
      { id: 'M2', complete: true, weight: 3 },  // 3/4 * 4000 = 3000
    ]
  );
  assert.equal(res.milestonesCompleted, 2);
  assert.equal(res.recognizedAgorot, toAgorot(4000));
});

/* ---------- contractModification (spec alias) ---------- */

test('v1.1 contractModification — separate alias', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'CM-SEP',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'a', standaloneSSP: 1000, timing: 'point' }],
  });
  const res = dr.contractModification({
    contractId: c.id,
    change: {
      type: 'separate',
      additionalPrice: 500,
      newObligations: [{ id: 'b', standaloneSSP: 500, timing: 'point' }],
    },
  });
  assert.equal(res.modificationType, 'separate');
  const after = dr.getContract(c.id);
  assert.equal(after.performanceObligations.length, 2);
  assert.equal(after.totalAgorot, toAgorot(1500));
});

test('v1.1 contractModification — prospective alias', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'CM-PROS',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [
      { id: 'a', standaloneSSP: 500, timing: 'point' },
      { id: 'b', standaloneSSP: 500, timing: 'over-time' },
    ],
  });
  dr.satisfyObligation({ contractId: c.id, obligationId: 'a' });
  const res = dr.contractModification({
    contractId: c.id,
    change: {
      type: 'prospective',
      additionalPrice: 1000,
      newObligations: [{ id: 'c', standaloneSSP: 1000, timing: 'over-time' }],
    },
  });
  assert.equal(res.modificationType, 'prospective');
  const after = dr.getContract(c.id);
  assert.equal(after.totalAgorot, toAgorot(2000));
  assert.ok(after.performanceObligations.find(o => o.id === 'c'));
  assert.equal(after.version, 2);
});

test('v1.1 contractModification — retrospective alias with catch-up', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'CM-RETRO',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    percentComplete: 0.5, method: 'output',
  });
  const res = dr.contractModification({
    contractId: c.id,
    change: { type: 'retrospective', revisedTotal: 2000 },
  });
  assert.equal(res.modificationType, 'retrospective');
  assert.equal(res.catchUpAgorot, toAgorot(500));
  const after = dr.getContract(c.id);
  assert.equal(after.performanceObligations[0].allocatedAgorot, toAgorot(2000));
  assert.equal(after.performanceObligations[0].recognizedAgorot, toAgorot(1000));
});

/* ---------- billingSchedule ---------- */

test('v1.1 billingSchedule — invoices independent of recognition', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'BS-1',
    totalAmount: 1200,
    signedDate: '2026-01-01',
    startDate: '2026-01-01',
    performanceObligations: [{ id: 'saas', standaloneSSP: 1200, timing: 'over-time' }],
  });
  dr.scheduleSubscription({
    contractId: c.id, obligationId: 'saas',
    period: 'quarterly', amount: 300, recurring: 4,
    startDate: '2026-01-01',
  });
  dr.recordBilling({
    contractId: c.id, obligationId: 'saas',
    amount: 300, date: '2026-01-15', invoice: 'INV-Q1',
  });
  dr.recordBilling({
    contractId: c.id, obligationId: 'saas',
    amount: 300, date: '2026-04-15', invoice: 'INV-Q2',
  });
  const sched = dr.billingSchedule(c.id);
  assert.equal(sched.billings.length, 2);
  assert.equal(sched.scheduled.length, 4);
  assert.equal(sched.totalBilledAgorot, toAgorot(600));
  assert.match(sched.note_he, /חשבונ/);
  assert.match(sched.note_en, /tax-invoice/);
});

/* ---------- deferredRevenueRollforward ---------- */

test('v1.1 deferredRevenueRollforward — spec alias', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'ROLL-1',
    totalAmount: 1200,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'saas', standaloneSSP: 1200, timing: 'over-time' }],
  });
  dr.recordBilling({
    contractId: c.id, obligationId: 'saas',
    amount: 1200, date: '2026-01-31', invoice: 'INV-1',
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'saas',
    amount: 100, method: 'output', date: '2026-01-31',
  });
  const rf = dr.deferredRevenueRollforward({ period: '2026-01' });
  // Opening = 0 (no billing before Jan 1)
  // Additions = 1200
  // Recognized = 100
  // Closing = 1100
  assert.equal(rf.opening, 0);
  assert.equal(rf.additions, 1200);
  assert.equal(rf.recognized, 100);
  assert.equal(rf.closing, 1100);
});

/* ---------- journalEntry ---------- */

test('v1.1 journalEntry — billing leg DR AR / CR deferred + VAT', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'JE-1',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  dr.recordBilling({
    contractId: c.id, obligationId: 'x',
    amount: 1000, date: '2026-02-01', invoice: 'INV-JE-1',
  });
  const entries = dr.journalEntry(c.id, 'billing');
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.type, 'billing');
  // DR AR = 1000 + 180 VAT = 1180
  const ar = e.lines.find(l => l.account.startsWith('AR'));
  const defRev = e.lines.find(l => l.account.startsWith('Deferred Revenue'));
  const vat = e.lines.find(l => l.account.startsWith('VAT'));
  assert.equal(ar.dr, 1180);
  assert.equal(defRev.cr, 1000);
  assert.equal(vat.cr, 180);
  // Balanced DR = CR
  const drSum = e.lines.reduce((s, l) => s + l.dr, 0);
  const crSum = e.lines.reduce((s, l) => s + l.cr, 0);
  assert.equal(drSum, crSum);
});

test('v1.1 journalEntry — recognition leg DR deferred / CR revenue', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'JE-2',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    amount: 400, method: 'output', date: '2026-03-31',
  });
  const entries = dr.journalEntry(c.id, 'recognition');
  assert.equal(entries.length, 1);
  const e = entries[0];
  assert.equal(e.type, 'recognition');
  const def = e.lines.find(l => l.account.startsWith('Deferred Revenue'));
  const rev = e.lines.find(l => l.account.startsWith('Revenue'));
  assert.equal(def.dr, 400);
  assert.equal(rev.cr, 400);
  assert.match(e.memo_he, /הכרה בהכנסה/);
  assert.match(e.memo_en, /Revenue recognition/);
});

test('v1.1 journalEntry — all entries are double-entry balanced', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'JE-3',
    totalAmount: 500,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'p', standaloneSSP: 500, timing: 'over-time' }],
  });
  dr.recordBilling({
    contractId: c.id, obligationId: 'p',
    amount: 500, date: '2026-01-15', invoice: 'I-1',
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'p',
    amount: 250, method: 'output', date: '2026-03-15',
  });
  const all = dr.journalEntry(c.id);  // defaults to 'all'
  assert.equal(all.length, 2);
  for (const e of all) {
    const drSum = e.lines.reduce((s, l) => s + l.dr, 0);
    const crSum = e.lines.reduce((s, l) => s + l.cr, 0);
    assert.equal(drSum, crSum, `entry ${e.type} imbalanced`);
  }
});

/* ---------- reconcile ---------- */

test('v1.1 reconcile — identity holds opening+additions−recognized=closing', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'RC-1',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'x', standaloneSSP: 1000, timing: 'over-time' }],
  });
  dr.recordBilling({
    contractId: c.id, obligationId: 'x',
    amount: 1000, date: '2026-02-01', invoice: 'INV-RC',
  });
  dr.recognizeRevenue({
    contractId: c.id, obligationId: 'x',
    amount: 400, method: 'output', date: '2026-02-28',
  });
  const rec = dr.reconcile('2026-02');
  assert.equal(rec.identity.holds, true);
  assert.equal(rec.opening, 0);
  assert.equal(rec.additions, 1000);
  assert.equal(rec.recognized, 400);
  assert.equal(rec.closing, 600);
  assert.equal(rec.exceptions.length, 0);
  assert.equal(rec.byContract.length, 1);
  assert.equal(rec.byContract[0].contractLiability, 600);
});

/* ---------- exportForAudit ---------- */

test('v1.1 exportForAudit — bilingual audit payload', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'AUDIT-1',
    totalAmount: 12000,
    signedDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    performanceObligations: [
      { id: 'lic', standaloneSSP: 6000, timing: 'point' },
      { id: 'saas', standaloneSSP: 6000, timing: 'over-time' },
    ],
  });
  dr.satisfyObligation({ contractId: c.id, obligationId: 'lic', date: '2026-01-15' });
  dr.recordBilling({ contractId: c.id, obligationId: 'lic', amount: 6000, date: '2026-01-15', invoice: 'INV-L' });
  dr.recordBilling({ contractId: c.id, obligationId: 'saas', amount: 6000, date: '2026-01-31', invoice: 'INV-S' });
  dr.straightLineRecognition(
    { contractId: c.id, obligationId: 'saas' },
    '2026-01'
  );

  const exp = dr.exportForAudit('2026');
  assert.equal(exp.header.agent, 'Y-090');
  assert.equal(exp.header.standard, 'IFRS 15 — Revenue from Contracts with Customers');
  assert.match(exp.header.standardHe, /הכנסות מחוזים/);
  assert.ok(exp.disclosure);
  assert.ok(exp.reconciliation);
  assert.ok(exp.contracts);
  assert.equal(exp.contracts.length, 1);
  assert.ok(exp.glossary.he);
  assert.ok(exp.glossary.en);
  // Hebrew glossary covers mandatory IFRS 15 vocabulary
  assert.ok(exp.glossary.he['הכנסות מראש']);
  assert.ok(exp.glossary.he['מחויבות ביצוע']);
  assert.ok(exp.glossary.he['אבן דרך']);
  assert.ok(exp.glossary.he['אחוז השלמה']);
});

/* ---------- House rule: never delete ---------- */

test('v1.1 house rule — modifications are append-only, nothing deleted', () => {
  const dr = new DeferredRevenue();
  const c = dr.identifyContract({
    customerId: 'IMMUT-1',
    totalAmount: 1000,
    signedDate: '2026-01-01',
    performanceObligations: [{ id: 'a', standaloneSSP: 1000, timing: 'point' }],
  });
  dr.contractModification({
    contractId: c.id,
    change: { type: 'separate', additionalPrice: 500, newObligations: [{ id: 'b', standaloneSSP: 500, timing: 'point' }] },
  });
  dr.contractModification({
    contractId: c.id,
    change: { type: 'separate', additionalPrice: 300, newObligations: [{ id: 'c', standaloneSSP: 300, timing: 'point' }] },
  });
  const after = dr.getContract(c.id);
  assert.equal(after.history.length, 2);
  assert.equal(after.history[0].snapshot.performanceObligations.length, 1);
  assert.equal(after.history[1].snapshot.performanceObligations.length, 2);
  assert.equal(after.performanceObligations.length, 3);
  // The original obligation 'a' must still exist unchanged.
  assert.ok(after.performanceObligations.find(o => o.id === 'a'));
});

/* ---------- End-to-end: 5 steps with spec API ---------- */

test('v1.1 IFRS 15 five-step model — all spec methods chained', () => {
  const dr = new DeferredRevenue({ mode: 'accrual' });

  // Step 1
  const c = dr.identifyContract({
    customerId: 'E2E-SPEC',
    totalAmount: 20000,
    signedDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    performanceObligations: [
      { id: 'hardware', standaloneSSP: 12000, timing: 'point' },
      { id: 'license', standaloneSSP: 4000, timing: 'over-time' },
      { id: 'support', standaloneSSP: 4000, timing: 'over-time' },
    ],
  });

  // Step 2
  const pos = dr.identifyPerformanceObligations(c.id);
  assert.equal(pos.length, 3);

  // Step 3 — financing adjustment
  const tp = dr.determineTransactionPrice(c.id, { financingComponent: 0 });
  assert.equal(tp.totalAgorot, toAgorot(20000));

  // Step 4 — relative-SSP
  const alloc = dr.allocateTransactionPrice(c.id, 'relative-SSP');
  const allocSum = alloc.allocations.reduce((s, a) => s + a.allocatedAgorot, 0);
  assert.equal(allocSum, toAgorot(20000));

  // Step 5 — mix of recognition methods
  dr.satisfyObligation({ contractId: c.id, obligationId: 'hardware', date: '2026-01-15' });
  for (let m = 1; m <= 12; m += 1) {
    dr.straightLineRecognition(
      { contractId: c.id, obligationId: 'license' },
      `2026-${String(m).padStart(2, '0')}`
    );
  }
  dr.milestoneRecognition(
    { contractId: c.id, obligationId: 'support' },
    [
      { id: 'S1', name: 'Q1', complete: true, weight: 1, date: '2026-03-31' },
      { id: 'S2', name: 'Q2', complete: true, weight: 1, date: '2026-06-30' },
      { id: 'S3', name: 'Q3', complete: true, weight: 1, date: '2026-09-30' },
      { id: 'S4', name: 'Q4', complete: true, weight: 1, date: '2026-12-31' },
    ]
  );

  const final = dr.getContract(c.id);
  const totalRecognized = final.performanceObligations.reduce((s, o) => s + o.recognizedAgorot, 0);
  assert.equal(totalRecognized, toAgorot(20000));
  assert.ok(final.performanceObligations.every(o => o.satisfied));

  // Reconcile + export
  const rec = dr.reconcile('2026');
  assert.equal(rec.identity.holds, true);
  const audit = dr.exportForAudit('2026');
  assert.equal(audit.contracts.length, 1);
});
