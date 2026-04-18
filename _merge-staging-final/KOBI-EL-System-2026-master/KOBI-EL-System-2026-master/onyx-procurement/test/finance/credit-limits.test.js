/**
 * Unit tests — Customer Credit Limit Manager
 * Agent Y-086 — Mega-ERP Techno-Kol Uzi (Kobi EL)
 *
 * Run: node --test onyx-procurement/test/finance/credit-limits.test.js
 *
 * House rule: לא מוחקים — רק משדרגים ומגדלים.
 * Zero external deps.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CreditLimitManager,
  BASIS,
  COLLATERAL_TYPES,
  GUARANTEE_TYPES,
  INSURERS,
  RATING_GRADES,
} = require('../../src/finance/credit-limits');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function makeClock(initialIso) {
  let now = Date.parse(initialIso);
  const fn = () => now;
  fn.advance = (ms) => { now += ms; };
  fn.advanceDays = (d) => { now += d * 86_400_000; };
  fn.advanceMonths = (m) => {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() + m);
    now = d.getTime();
  };
  fn.set = (iso) => { now = Date.parse(iso); };
  return fn;
}

function makeSources({ ar = {}, pending = {}, history = {}, dnb, bdi } = {}) {
  return {
    getOutstandingAR: (id) => ar[id] || 0,
    getPendingOrders: (id) => pending[id] || 0,
    getPaymentHistory: (id) => history[id] || {},
    dnb,
    bdi,
  };
}

function makeManager(overrides = {}) {
  const clock = overrides.clock || makeClock('2026-01-01T00:00:00Z');
  const mgr = new CreditLimitManager({
    clock,
    gracePct: overrides.gracePct,
    reviewMonths: overrides.reviewMonths,
    dataSources: overrides.dataSources || makeSources(),
  });
  return { mgr, clock };
}

// ─────────────────────────────────────────────────────────────
// Constants sanity
// ─────────────────────────────────────────────────────────────

test('CONSTANTS — enums cover the required domain values', () => {
  for (const b of ['history', 'DNB-rating', 'BDI', 'financial-statements', 'guarantee']) {
    assert.ok(BASIS.includes(b), `missing basis ${b}`);
  }
  assert.deepEqual([...COLLATERAL_TYPES].sort(), ['deposit', 'guarantee', 'lien'].sort());
  assert.deepEqual([...GUARANTEE_TYPES].sort(), ['bank', 'insurance', 'personal'].sort());
  for (const i of ['Euler Hermes', 'Atradius', 'Coface', 'Clal']) {
    assert.ok(INSURERS.includes(i), `missing insurer ${i}`);
  }
  assert.deepEqual([...RATING_GRADES], ['A', 'B', 'C', 'D', 'E']);
});

// ─────────────────────────────────────────────────────────────
// setLimit
// ─────────────────────────────────────────────────────────────

test('setLimit — creates an active record with Hebrew basis label', () => {
  const { mgr } = makeManager();
  const rec = mgr.setLimit({
    customerId: 'CUST-001',
    limit: 100_000,
    currency: 'ILS',
    effectiveDate: '2026-01-01T00:00:00Z',
    expiryDate: '2027-01-01T00:00:00Z',
    requestedBy: 'sales-manager',
    approvedBy: 'cfo',
    basis: 'history',
  });
  assert.equal(rec.limit, 100_000);
  assert.equal(rec.currency, 'ILS');
  assert.equal(rec.active, true);
  assert.equal(rec.basisHe, 'היסטוריית תשלומים');
  assert.equal(rec.version, 1);
  assert.ok(rec.history.length >= 1);
  assert.equal(rec.history[0].action, 'created');
});

test('setLimit — requestedBy must differ from approvedBy (segregation of duties)', () => {
  const { mgr } = makeManager();
  assert.throws(() => mgr.setLimit({
    customerId: 'CUST-001',
    limit: 1000,
    requestedBy: 'same',
    approvedBy: 'same',
    basis: 'history',
  }), /segregation of duties/);
});

test('setLimit — supersedes prior active record (never deletes)', () => {
  const { mgr } = makeManager();
  mgr.setLimit({
    customerId: 'CUST-001', limit: 50_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 120_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'financial-statements',
  });
  const hist = mgr.limitHistory('CUST-001');
  assert.equal(hist.length, 2, 'both records preserved');
  assert.equal(hist[0].active, false);
  assert.equal(hist[0].supersededAt != null, true);
  assert.equal(hist[1].active, true);
  const active = mgr.activeLimit('CUST-001');
  assert.equal(active.limit, 120_000);
});

// ─────────────────────────────────────────────────────────────
// availableCredit
// ─────────────────────────────────────────────────────────────

test('availableCredit — limit minus outstanding minus pending', () => {
  const ds = makeSources({
    ar: { 'CUST-001': 30_000 },
    pending: { 'CUST-001': 15_000 },
  });
  const { mgr } = makeManager({ dataSources: ds });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 100_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  const snap = mgr.availableCredit('CUST-001');
  assert.equal(snap.limit, 100_000);
  assert.equal(snap.outstanding, 30_000);
  assert.equal(snap.pending, 15_000);
  assert.equal(snap.available, 55_000);
  assert.equal(snap.hasActiveLimit, true);
});

test('availableCredit — unknown customer returns zero, hasActiveLimit=false', () => {
  const { mgr } = makeManager();
  const snap = mgr.availableCredit('GHOST');
  assert.equal(snap.limit, 0);
  assert.equal(snap.available, 0);
  assert.equal(snap.hasActiveLimit, false);
});

// ─────────────────────────────────────────────────────────────
// blockOrder
// ─────────────────────────────────────────────────────────────

test('blockOrder — allows when exposure <= limit', () => {
  const ds = makeSources({
    ar: { 'CUST-001': 20_000 },
    pending: { 'CUST-001': 10_000 },
  });
  const { mgr } = makeManager({ dataSources: ds });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 100_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  assert.equal(mgr.blockOrder({ customerId: 'CUST-001', orderAmount: 50_000 }), false);
  // exactly at the limit — not blocked
  assert.equal(mgr.blockOrder({ customerId: 'CUST-001', orderAmount: 70_000 }), false);
});

test('blockOrder — blocks when exposure exceeds limit', () => {
  const ds = makeSources({
    ar: { 'CUST-001': 40_000 },
    pending: { 'CUST-001': 20_000 },
  });
  const { mgr } = makeManager({ dataSources: ds });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 100_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  // 40k + 20k + 50k = 110k > 100k → blocked
  assert.equal(mgr.blockOrder({ customerId: 'CUST-001', orderAmount: 50_000 }), true);
});

test('blockOrder — grace band lets small overages through', () => {
  const ds = makeSources({
    ar: { 'CUST-001': 50_000 },
    pending: { 'CUST-001': 30_000 },
  });
  const { mgr } = makeManager({ dataSources: ds, gracePct: 10 });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 100_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  // exposure 50+30+25 = 105k, grace band 110k → NOT blocked
  assert.equal(mgr.blockOrder({ customerId: 'CUST-001', orderAmount: 25_000 }), false);
  // exposure 50+30+35 = 115k, grace band 110k → blocked
  assert.equal(mgr.blockOrder({ customerId: 'CUST-001', orderAmount: 35_000 }), true);
});

test('blockOrder — unknown customer is blocked by default', () => {
  const { mgr } = makeManager();
  assert.equal(mgr.blockOrder({ customerId: 'GHOST', orderAmount: 1 }), true);
});

// ─────────────────────────────────────────────────────────────
// overrideBlock — logging
// ─────────────────────────────────────────────────────────────

test('overrideBlock — appends a logged override entry (never deleted)', () => {
  const { mgr } = makeManager();
  mgr.setLimit({
    customerId: 'CUST-001', limit: 50_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  const ov = mgr.overrideBlock({
    orderId: 'ORD-777',
    approver: 'cfo',
    reason: 'strategic customer — Q4 push',
    customerId: 'CUST-001',
    orderAmount: 70_000,
  });
  assert.ok(ov.id.startsWith('OVR-'));
  assert.equal(ov.orderId, 'ORD-777');
  assert.equal(ov.approver, 'cfo');
  assert.equal(ov.limitAtTime, 50_000);
  assert.equal(ov.orderAmount, 70_000);
  // second override is appended, not replacing
  mgr.overrideBlock({
    orderId: 'ORD-778', approver: 'ceo',
    reason: 'one-off', customerId: 'CUST-001', orderAmount: 10_000,
  });
  const all = mgr.overrides();
  assert.equal(all.length, 2);
  // event stream contains both
  const log = mgr.eventLog();
  const overrideEvents = log.filter(e => e.type === 'override.block');
  assert.equal(overrideEvents.length, 2);
});

test('overrideBlock — requires orderId, approver and reason', () => {
  const { mgr } = makeManager();
  assert.throws(() => mgr.overrideBlock({
    approver: 'cfo', reason: 'x',
  }), /orderId/);
  assert.throws(() => mgr.overrideBlock({
    orderId: 'O1', reason: 'x',
  }), /approver/);
  assert.throws(() => mgr.overrideBlock({
    orderId: 'O1', approver: 'cfo',
  }), /reason/);
});

// ─────────────────────────────────────────────────────────────
// rating — computation
// ─────────────────────────────────────────────────────────────

test('rating — A grade for clean payment history', () => {
  const ds = makeSources({
    history: {
      'CUST-A': {
        totalPayments: 50, onTimePayments: 50,
        avgDaysToPay: 22, bouncedChecks: 0, openDisputes: 0,
      },
    },
  });
  const { mgr } = makeManager({ dataSources: ds });
  const r = mgr.rating('CUST-A');
  assert.equal(r.grade, 'A');
  assert.ok(r.score >= 85, `score too low: ${r.score}`);
  assert.equal(r.components.onTimeScore, 100);
  assert.equal(r.components.daysScore, 100);
});

test('rating — E grade for chronically bad payer', () => {
  const ds = makeSources({
    history: {
      'CUST-E': {
        totalPayments: 20, onTimePayments: 2,
        avgDaysToPay: 95, bouncedChecks: 4, openDisputes: 3,
      },
    },
  });
  const { mgr } = makeManager({ dataSources: ds });
  const r = mgr.rating('CUST-E');
  assert.equal(r.grade, 'E');
  assert.ok(r.score < 40, `score too high: ${r.score}`);
});

test('rating — no history = E (score 0)', () => {
  const { mgr } = makeManager();
  const r = mgr.rating('CUST-NEW');
  assert.equal(r.grade, 'E');
  assert.equal(r.score, 0);
});

test('rating — B/C grades are scaled linearly', () => {
  const ds = makeSources({
    history: {
      'CUST-B': {
        totalPayments: 40, onTimePayments: 34, // 85%
        avgDaysToPay: 45, bouncedChecks: 1, openDisputes: 0,
      },
      'CUST-C': {
        totalPayments: 40, onTimePayments: 24, // 60%
        avgDaysToPay: 60, bouncedChecks: 2, openDisputes: 1,
      },
    },
  });
  const { mgr } = makeManager({ dataSources: ds });
  const b = mgr.rating('CUST-B');
  const c = mgr.rating('CUST-C');
  assert.ok(['A', 'B'].includes(b.grade), `unexpected grade ${b.grade}`);
  assert.ok(['B', 'C', 'D'].includes(c.grade), `unexpected grade ${c.grade}`);
  assert.ok(b.score > c.score);
});

// ─────────────────────────────────────────────────────────────
// requestIncrease
// ─────────────────────────────────────────────────────────────

test('requestIncrease — workflow submit → decide approved', () => {
  const { mgr } = makeManager();
  mgr.setLimit({
    customerId: 'CUST-001', limit: 50_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  const req = mgr.requestIncrease({
    customerId: 'CUST-001', newLimit: 120_000,
    reason: 'volume ramp Q2',
    supporting: ['financials-2025.pdf'],
    requestedBy: 'sales',
  });
  assert.equal(req.status, 'pending');
  assert.equal(req.currentLimit, 50_000);
  assert.equal(req.delta, 70_000);
  const decided = mgr.decideIncrease({
    requestId: req.id, decidedBy: 'cfo', decision: 'approved',
    note: 'ok, subject to monthly review',
  });
  assert.equal(decided.status, 'approved');
  assert.equal(decided.decidedBy, 'cfo');
  assert.ok(decided.history.some(h => h.action === 'approved'));
});

test('requestIncrease — rejects when newLimit not above current', () => {
  const { mgr } = makeManager();
  mgr.setLimit({
    customerId: 'CUST-001', limit: 50_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  assert.throws(() => mgr.requestIncrease({
    customerId: 'CUST-001', newLimit: 40_000,
    reason: 'x', requestedBy: 'sales',
  }), /must exceed current/);
});

// ─────────────────────────────────────────────────────────────
// queryDNB — stub + adapters
// ─────────────────────────────────────────────────────────────

test('queryDNB — returns shell when no adapter injected', () => {
  const { mgr } = makeManager();
  const r = mgr.queryDNB('CUST-001');
  assert.equal(r.customerId, 'CUST-001');
  assert.equal(r.dnb, null);
  assert.equal(r.bdi, null);
  assert.equal(r.source, 'stub');
});

test('queryDNB — calls injected DNB + BDI adapters', () => {
  const calls = [];
  const ds = makeSources({
    dnb: { query: (id) => { calls.push(['dnb', id]); return { paydex: 80, riskLevel: 'low' }; } },
    bdi: { query: (id) => { calls.push(['bdi', id]); return { rating: 3, openLiens: 0 }; } },
  });
  const { mgr } = makeManager({ dataSources: ds });
  const r = mgr.queryDNB('CUST-001');
  assert.deepEqual(r.dnb, { paydex: 80, riskLevel: 'low' });
  assert.deepEqual(r.bdi, { rating: 3, openLiens: 0 });
  assert.equal(r.source, 'dnb+bdi');
  assert.equal(calls.length, 2);
});

// ─────────────────────────────────────────────────────────────
// collateral / guarantee / insurance registers
// ─────────────────────────────────────────────────────────────

test('collateralTracking — persisted with Hebrew label', () => {
  const { mgr } = makeManager();
  const e = mgr.collateralTracking({
    customerId: 'CUST-001',
    type: 'deposit',
    amount: 20_000,
    expiry: '2027-12-31T00:00:00Z',
    notes: 'cash deposit',
  });
  assert.equal(e.type, 'deposit');
  assert.equal(e.typeHe, 'פיקדון');
  assert.equal(e.status, 'active');
  assert.equal(mgr.collaterals({ customerId: 'CUST-001' }).length, 1);
});

test('guaranteeRegister — tracks personal/bank/insurance guarantees', () => {
  const { mgr } = makeManager();
  mgr.guaranteeRegister({
    customerId: 'CUST-001', type: 'bank', amount: 200_000,
    guarantor: 'Bank Hapoalim', expiry: '2027-06-30T00:00:00Z',
  });
  mgr.guaranteeRegister({
    customerId: 'CUST-001', type: 'personal', amount: 50_000,
    guarantor: 'Uzi Cohen (owner)',
  });
  const list = mgr.guarantees({ customerId: 'CUST-001' });
  assert.equal(list.length, 2);
  assert.ok(list.some(g => g.type === 'bank'));
  assert.ok(list.some(g => g.type === 'personal'));
});

test('insuranceRegister — only approved insurers accepted', () => {
  const { mgr } = makeManager();
  const e = mgr.insuranceRegister({
    customerId: 'CUST-001', insurer: 'Clal',
    coverage: 500_000, expiry: '2027-01-01T00:00:00Z',
    policyNumber: 'POL-9000',
  });
  assert.equal(e.insurer, 'Clal');
  assert.equal(e.status, 'active');
  assert.throws(() => mgr.insuranceRegister({
    customerId: 'CUST-001', insurer: 'Acme Insurance', coverage: 1,
  }), /insurer must be/);
});

// ─────────────────────────────────────────────────────────────
// expireReview — annual cycle
// ─────────────────────────────────────────────────────────────

test('expireReview — lists limits whose nextReview is overdue', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const { mgr } = makeManager({ clock });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 100_000,
    effectiveDate: '2026-01-01T00:00:00Z',
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  mgr.setLimit({
    customerId: 'CUST-002', limit: 50_000,
    effectiveDate: '2026-01-01T00:00:00Z',
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  // before one year → none due
  assert.equal(mgr.expireReview().length, 0);
  // 13 months later → both due
  clock.advanceMonths(13);
  const due = mgr.expireReview();
  assert.equal(due.length, 2);
  assert.ok(due.every(d => d.overdueByDays >= 30));
});

test('markReviewed — pushes nextReview forward, keeps history', () => {
  const clock = makeClock('2026-01-01T00:00:00Z');
  const { mgr } = makeManager({ clock });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 100_000,
    effectiveDate: '2026-01-01T00:00:00Z',
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  clock.advanceMonths(13);
  assert.equal(mgr.expireReview().length, 1);
  mgr.markReviewed({
    customerId: 'CUST-001', reviewer: 'cfo', note: 'ok',
  });
  assert.equal(mgr.expireReview().length, 0);
  const active = mgr.activeLimit('CUST-001');
  assert.ok(active.history.some(h => h.action === 'reviewed'));
});

// ─────────────────────────────────────────────────────────────
// concentrationRisk
// ─────────────────────────────────────────────────────────────

test('concentrationRisk — top customer share and HHI', () => {
  const ar = {
    'CUST-BIG':   800_000,
    'CUST-MID-1': 100_000,
    'CUST-MID-2':  60_000,
    'CUST-SM-1':   30_000,
    'CUST-SM-2':   10_000,
  };
  const ds = makeSources({ ar });
  const { mgr } = makeManager({ dataSources: ds });
  for (const id of Object.keys(ar)) {
    mgr.setLimit({
      customerId: id, limit: ar[id] * 1.5,
      requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
    });
  }
  const cr = mgr.concentrationRisk();
  assert.equal(cr.totalAR, 1_000_000);
  assert.equal(cr.customerCount, 5);
  assert.equal(cr.top[0].customerId, 'CUST-BIG');
  assert.equal(cr.top[0].share, 0.8);
  assert.ok(cr.top1Share >= 0.8);
  assert.ok(cr.concentrated, 'should flag concentration risk');
  assert.ok(cr.hhi > 2500, `hhi too low: ${cr.hhi}`);
});

test('concentrationRisk — empty manager returns zero totals', () => {
  const { mgr } = makeManager();
  const cr = mgr.concentrationRisk();
  assert.equal(cr.totalAR, 0);
  assert.equal(cr.customerCount, 0);
  assert.equal(cr.concentrated, false);
});

// ─────────────────────────────────────────────────────────────
// Persistence / house-rule: no deletions
// ─────────────────────────────────────────────────────────────

test('house rule — nothing is ever deleted', () => {
  const { mgr } = makeManager();
  mgr.setLimit({
    customerId: 'CUST-001', limit: 50_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'history',
  });
  mgr.setLimit({
    customerId: 'CUST-001', limit: 80_000,
    requestedBy: 'sm', approvedBy: 'cfo', basis: 'financial-statements',
  });
  mgr.overrideBlock({
    orderId: 'ORD-1', approver: 'cfo', reason: 'x',
    customerId: 'CUST-001', orderAmount: 10_000,
  });
  mgr.collateralTracking({
    customerId: 'CUST-001', type: 'deposit', amount: 1,
  });
  mgr.guaranteeRegister({
    customerId: 'CUST-001', type: 'bank', amount: 1,
    guarantor: 'Bank Leumi',
  });
  mgr.insuranceRegister({
    customerId: 'CUST-001', insurer: 'Coface', coverage: 1,
  });
  assert.equal(mgr.limitHistory('CUST-001').length, 2);
  assert.equal(mgr.overrides().length, 1);
  assert.equal(mgr.collaterals({ customerId: 'CUST-001' }).length, 1);
  assert.equal(mgr.guarantees({ customerId: 'CUST-001' }).length, 1);
  assert.equal(mgr.insurances({ customerId: 'CUST-001' }).length, 1);
  const log = mgr.eventLog();
  assert.ok(log.length >= 6);
});
