/**
 * Tests for onyx-procurement/src/sales/commission.js
 *
 * Agent Y-017 | Swarm Sales | Techno-Kol Uzi mega-ERP 2026
 *
 * Zero-dep Commission Engine tests. Covers:
 *   - Plan definition (flat / tiered / accelerator) + validation
 *   - Plan upgrade (never-delete rule)
 *   - Assignment history
 *   - Tier boundary math (marginal brackets)
 *   - Accelerator across quota boundary
 *   - Cap and floor enforcement
 *   - Split allocation — must sum to exactly 100%
 *   - Manager override (additive, not deducted from seller)
 *   - Seller + SE split semantics
 *   - Draw advance + draw recovery
 *   - Clawback on unpaid invoice
 *   - Clawback on paid-late invoice
 *   - Pipeline forecasting
 *   - Bilingual commission statement
 *   - Immutability (snapshot / listCalculations never mutate state)
 *
 * Run:
 *   node --test test/sales/commission.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const COMMISSION_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'onyx-procurement',
  'src',
  'sales',
  'commission.js'
);

const {
  CommissionEngine,
  PLAN_TYPE_LABELS,
  ROLE_LABELS,
  REASON_LABELS,
} = require(COMMISSION_PATH);

// ─────────────────────────────────────────────────────────────
// Fixed-clock helper
// ─────────────────────────────────────────────────────────────
function fixedClock(startMs) {
  let t = startMs;
  return {
    now: function () { return t; },
    advanceDays: function (n) { t += n * 86400000; },
    set: function (ms) { t = ms; },
  };
}

// ─────────────────────────────────────────────────────────────
// Canonical Q1-2026 period
// ─────────────────────────────────────────────────────────────
const Q1_2026 = {
  from: '2026-01-01T00:00:00.000Z',
  to:   '2026-03-31T23:59:59.999Z',
};

// ─────────────────────────────────────────────────────────────
// Suite: Plan definition + validation
// ─────────────────────────────────────────────────────────────

describe('commission — plan definition & validation', function () {
  test('01: defines a flat plan', function () {
    const eng = new CommissionEngine();
    const id = eng.definePlan({
      id: 'FLAT-5', name: 'Flat 5%', type: 'flat', rate: 0.05,
    });
    assert.equal(id, 'FLAT-5');
    const p = eng.getPlan('FLAT-5');
    assert.equal(p.type, 'flat');
    assert.equal(p.rate, 0.05);
    assert.equal(p.version, 1);
    assert.equal(p.labels.type.he, 'אחיד');
  });

  test('02: rejects flat plan without rate', function () {
    const eng = new CommissionEngine();
    assert.throws(function () {
      eng.definePlan({ id: 'BAD', type: 'flat' });
    }, /E_PLAN_INVALID/);
  });

  test('03: defines a tiered plan and verifies tier contiguity', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'TIER-1', name: 'Tiered',
      type: 'tiered',
      tiers: [
        { from: 0,      to: 100000, rate: 0.03 },
        { from: 100000, to: 250000, rate: 0.05 },
        { from: 250000, to: Infinity, rate: 0.08 },
      ],
    });
    const p = eng.getPlan('TIER-1');
    assert.equal(p.type, 'tiered');
    assert.equal(p.tiers.length, 3);
  });

  test('04: rejects tiered plan with gaps between tiers', function () {
    const eng = new CommissionEngine();
    assert.throws(function () {
      eng.definePlan({
        id: 'BAD', type: 'tiered', tiers: [
          { from: 0,      to: 100000, rate: 0.03 },
          { from: 150000, to: 250000, rate: 0.05 },
        ],
      });
    }, /E_PLAN_INVALID/);
  });

  test('05: defines an accelerator plan', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'ACC-1', name: 'Accelerator',
      type: 'accelerator',
      quota: 200000,
      baseRate: 0.05,
      acceleratorRate: 0.08,
    });
    const p = eng.getPlan('ACC-1');
    assert.equal(p.quota, 200000);
    assert.equal(p.acceleratorRate, 0.08);
  });

  test('06: rejects accelerator with acceleratorRate < baseRate', function () {
    const eng = new CommissionEngine();
    assert.throws(function () {
      eng.definePlan({
        id: 'BAD', type: 'accelerator',
        quota: 100000, baseRate: 0.08, acceleratorRate: 0.05,
      });
    }, /E_PLAN_INVALID/);
  });

  test('07: redefining a plan bumps version (never delete)', function () {
    const eng = new CommissionEngine();
    eng.definePlan({ id: 'P1', type: 'flat', rate: 0.05 });
    eng.definePlan({ id: 'P1', type: 'flat', rate: 0.07 });
    const p = eng.getPlan('P1');
    assert.equal(p.version, 2);
    assert.equal(p.rate, 0.07);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Assignment
// ─────────────────────────────────────────────────────────────

describe('commission — assignment', function () {
  test('08: assigns and looks up active plan', function () {
    const eng = new CommissionEngine();
    eng.definePlan({ id: 'FLAT-5', type: 'flat', rate: 0.05 });
    eng.assignPlan('S001', 'FLAT-5', '2026-01-01T00:00:00Z');
    const p = eng.getActivePlanFor('S001', '2026-02-01T00:00:00Z');
    assert.ok(p);
    assert.equal(p.id, 'FLAT-5');
  });

  test('09: assignment transition stamps end date on previous', function () {
    const eng = new CommissionEngine();
    eng.definePlan({ id: 'A', type: 'flat', rate: 0.05 });
    eng.definePlan({ id: 'B', type: 'flat', rate: 0.07 });
    eng.assignPlan('S001', 'A', '2026-01-01T00:00:00Z');
    eng.assignPlan('S001', 'B', '2026-03-01T00:00:00Z');
    const list = eng.listAssignments('S001');
    assert.equal(list.length, 2);
    assert.ok(list[0].endDate);   // prior assignment closed
    assert.equal(list[1].endDate, null);
    const active = eng.getActivePlanFor('S001', '2026-03-15T00:00:00Z');
    assert.equal(active.id, 'B');
  });

  test('10: rejects assignment against unknown plan', function () {
    const eng = new CommissionEngine();
    assert.throws(function () {
      eng.assignPlan('S001', 'NOPE', '2026-01-01T00:00:00Z');
    }, /E_ASSIGN/);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Tier boundary math
// ─────────────────────────────────────────────────────────────

describe('commission — tier boundary math', function () {
  test('11: tiered plan at exact first tier top', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'TIER', type: 'tiered',
      tiers: [
        { from: 0,      to: 100000, rate: 0.03 },
        { from: 100000, to: 250000, rate: 0.05 },
        { from: 250000, to: Infinity, rate: 0.08 },
      ],
    });
    eng.assignPlan('S1', 'TIER', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        { id: 'D1', amount: 100000, closedDate: '2026-01-15T00:00:00Z',
          customer: 'Acme', productGroup: 'SW' },
      ],
    });
    // Exactly 100k → all at first tier (0.03) → 3,000
    assert.equal(r.perDeal[0].commission, 3000);
    assert.equal(r.totals.grossCommission, 3000);
  });

  test('12: tiered plan crossing first and second tier', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'TIER', type: 'tiered',
      tiers: [
        { from: 0,      to: 100000, rate: 0.03 },
        { from: 100000, to: 250000, rate: 0.05 },
        { from: 250000, to: Infinity, rate: 0.08 },
      ],
    });
    eng.assignPlan('S1', 'TIER', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        { id: 'D1', amount: 150000, closedDate: '2026-01-10T00:00:00Z' },
      ],
    });
    // 100k @ 3% + 50k @ 5% = 3000 + 2500 = 5500
    assert.equal(r.perDeal[0].commission, 5500);
    assert.equal(r.totals.grossCommission, 5500);
  });

  test('13: tiered plan crossing all three tiers', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'TIER', type: 'tiered',
      tiers: [
        { from: 0,      to: 100000, rate: 0.03 },
        { from: 100000, to: 250000, rate: 0.05 },
        { from: 250000, to: Infinity, rate: 0.08 },
      ],
    });
    eng.assignPlan('S1', 'TIER', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        { id: 'D1', amount: 300000, closedDate: '2026-02-01T00:00:00Z' },
      ],
    });
    // 100k @ 3% + 150k @ 5% + 50k @ 8% = 3000 + 7500 + 4000 = 14500
    assert.equal(r.perDeal[0].commission, 14500);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Accelerator
// ─────────────────────────────────────────────────────────────

describe('commission — accelerator', function () {
  test('14: below quota pays base rate only', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'ACC', type: 'accelerator',
      quota: 200000, baseRate: 0.05, acceleratorRate: 0.08,
    });
    eng.assignPlan('S1', 'ACC', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        { id: 'D1', amount: 100000, closedDate: '2026-01-05T00:00:00Z' },
      ],
    });
    // Fully under quota → 5%
    assert.equal(r.perDeal[0].commission, 5000);
    assert.equal(r.totals.acceleratorApplied, false);
  });

  test('15: second deal crossing quota splits base + accelerator', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'ACC', type: 'accelerator',
      quota: 200000, baseRate: 0.05, acceleratorRate: 0.08,
    });
    eng.assignPlan('S1', 'ACC', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        { id: 'D1', amount: 150000, closedDate: '2026-01-05T00:00:00Z' },
        { id: 'D2', amount: 100000, closedDate: '2026-02-05T00:00:00Z' },
      ],
    });
    // D1: 150k @ 5% = 7500 (running=150k, under quota)
    // D2: 50k @ 5% + 50k @ 8% = 2500 + 4000 = 6500
    // total = 14000
    assert.equal(r.perDeal[0].commission, 7500);
    assert.equal(r.perDeal[1].commission, 6500);
    assert.equal(r.totals.grossCommission, 14000);
    assert.equal(r.totals.acceleratorApplied, true);
  });

  test('16: entirely above quota pays accelerator rate only', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'ACC', type: 'accelerator',
      quota: 100000, baseRate: 0.05, acceleratorRate: 0.10,
    });
    eng.assignPlan('S1', 'ACC', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        { id: 'D1', amount: 100000, closedDate: '2026-01-05T00:00:00Z' },
        { id: 'D2', amount: 100000, closedDate: '2026-02-05T00:00:00Z' },
      ],
    });
    // D1: 100k at 5% = 5000 (fills quota exactly)
    // D2: 100k entirely above quota → 10% = 10000
    assert.equal(r.perDeal[1].commission, 10000);
    assert.equal(r.totals.grossCommission, 15000);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Split allocation
// ─────────────────────────────────────────────────────────────

describe('commission — split allocation', function () {
  test('17: applySplit sums to 100% exactly', function () {
    const eng = new CommissionEngine();
    const shares = eng.applySplit(
      { id: 'D1', amount: 100000 },
      [
        { salespersonId: 'S1', role: 'seller', pct: 0.7 },
        { salespersonId: 'E1', role: 'se',     pct: 0.3 },
      ]
    );
    assert.equal(shares.length, 2);
    assert.equal(shares[0].amount, 70000);
    assert.equal(shares[1].amount, 30000);
    const sum = shares.reduce(function (a, s) { return a + s.pct; }, 0);
    assert.equal(Math.round(sum * 10000) / 10000, 1.0);
  });

  test('18: applySplit rejects split that does not sum to 100%', function () {
    const eng = new CommissionEngine();
    assert.throws(function () {
      eng.applySplit(
        { id: 'D1', amount: 100000 },
        [
          { salespersonId: 'S1', pct: 0.6 },
          { salespersonId: 'S2', pct: 0.3 },
        ]
      );
    }, /E_SPLIT_NOT_100/);
  });

  test('19: deal-level split overrides plan splitRules', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'FLAT', type: 'flat', rate: 0.10,
      splitRules: [
        { salespersonId: 'S1', role: 'seller', pct: 0.5 },
        { salespersonId: 'E1', role: 'se',     pct: 0.5 },
      ],
    });
    eng.assignPlan('S1', 'FLAT', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1',
      period: Q1_2026,
      sales: [
        {
          id: 'D1', amount: 100000,
          closedDate: '2026-01-10T00:00:00Z',
          split: [
            { salespersonId: 'S1', role: 'seller', pct: 0.8 },
            { salespersonId: 'E1', role: 'se',     pct: 0.2 },
          ],
        },
      ],
    });
    // S1 gets 80% share → 80,000 × 10% = 8,000
    assert.equal(r.perDeal[0].shareAmount, 80000);
    assert.equal(r.perDeal[0].commission, 8000);
  });

  test('20: manager override is additive (not deducted from seller)', function () {
    const eng = new CommissionEngine();
    // Manager override accounts for 10% extra on top of a 100% split
    // between seller and SE. The sum of non-override pct still = 1.0.
    assert.doesNotThrow(function () {
      eng.applySplit(
        { id: 'D1', amount: 100000 },
        [
          { salespersonId: 'S1', role: 'seller',  pct: 0.7 },
          { salespersonId: 'E1', role: 'se',      pct: 0.3 },
          { salespersonId: 'M1', role: 'manager', pct: 0.1, override: true },
        ]
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Cap / Floor / Draw
// ─────────────────────────────────────────────────────────────

describe('commission — cap / floor / draw', function () {
  test('21: cap enforced', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'FLAT-CAP', type: 'flat', rate: 0.10, cap: 5000,
    });
    eng.assignPlan('S1', 'FLAT-CAP', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1', period: Q1_2026,
      sales: [
        { id: 'D1', amount: 100000, closedDate: '2026-01-05T00:00:00Z' },
      ],
    });
    // Gross 10,000 → capped at 5,000
    assert.equal(r.totals.grossCommission, 10000);
    assert.equal(r.totals.commissionAfterCap, 5000);
    assert.equal(r.totals.capApplied, true);
  });

  test('22: floor enforced', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'FLAT-FL', type: 'flat', rate: 0.01, floor: 500,
    });
    eng.assignPlan('S1', 'FLAT-FL', '2026-01-01T00:00:00Z');
    const r = eng.calculate({
      salesperson: 'S1', period: Q1_2026,
      sales: [
        { id: 'D1', amount: 10000, closedDate: '2026-01-05T00:00:00Z' },
      ],
    });
    // 1% of 10k = 100 → floored to 500
    assert.equal(r.totals.grossCommission, 100);
    assert.equal(r.totals.commissionAfterCap, 500);
    assert.equal(r.totals.floorApplied, true);
  });

  test('23: draw advance + recovery', function () {
    const clock = fixedClock(new Date('2026-01-01').getTime());
    const eng = new CommissionEngine({ now: clock.now });
    eng.definePlan({
      id: 'DRAW', type: 'flat', rate: 0.05, draw: 3000,
    });
    eng.assignPlan('S1', 'DRAW', '2026-01-01T00:00:00Z');
    // Month 1: only 20k in sales → 1,000 gross → draw tops up to 3,000
    const r1 = eng.calculate({
      salesperson: 'S1',
      period: { from: '2026-01-01', to: '2026-01-31' },
      sales: [
        { id: 'D1', amount: 20000, closedDate: '2026-01-15T00:00:00Z' },
      ],
    });
    assert.equal(r1.totals.grossCommission, 1000);
    assert.equal(r1.totals.drawAdvanced, 2000);
    assert.equal(r1.totals.netPayable, 3000);
    assert.equal(r1.totals.outstandingDraw, 2000);
    // Month 2: 100k → 5,000 gross, recover 2,000 draw, pay 3,000
    const r2 = eng.calculate({
      salesperson: 'S1',
      period: { from: '2026-02-01', to: '2026-02-28' },
      sales: [
        { id: 'D2', amount: 100000, closedDate: '2026-02-10T00:00:00Z' },
      ],
    });
    assert.equal(r2.totals.grossCommission, 5000);
    assert.equal(r2.totals.drawRecovered, 2000);
    // net = 5000 - 2000 = 3000 (which is exactly draw, no top-up)
    assert.equal(r2.totals.netPayable, 3000);
    assert.equal(r2.totals.outstandingDraw, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Clawback
// ─────────────────────────────────────────────────────────────

describe('commission — clawback', function () {
  test('24: clawback on unpaid invoice past clawback window', function () {
    const clock = fixedClock(new Date('2026-01-01').getTime());
    const eng = new CommissionEngine({ now: clock.now });
    eng.definePlan({
      id: 'FLAT-CB', type: 'flat', rate: 0.05, clawbackPeriodDays: 60,
    });
    eng.assignPlan('S1', 'FLAT-CB', '2026-01-01T00:00:00Z');
    eng.calculate({
      salesperson: 'S1',
      period: { from: '2026-01-01', to: '2026-01-31' },
      sales: [
        { id: 'D1', amount: 100000,
          closedDate: '2026-01-10T00:00:00Z',
          paidDate: null, customer: 'Acme' },
      ],
    });
    // Fast-forward 90 days → past the 60-day clawback window
    clock.set(new Date('2026-04-15').getTime());
    const clawbacks = eng.applyClawback('S1',
      { from: '2026-01-01', to: '2026-04-30' });
    assert.equal(clawbacks.length, 1);
    assert.equal(clawbacks[0].amount, -5000);
    assert.equal(clawbacks[0].reason, 'unpaid_overdue');
    // Second call is idempotent (no duplicate clawback)
    const twice = eng.applyClawback('S1',
      { from: '2026-01-01', to: '2026-04-30' });
    assert.equal(twice.length, 0);
  });

  test('25: clawback on paid-late invoice', function () {
    const clock = fixedClock(new Date('2026-05-01').getTime());
    const eng = new CommissionEngine({ now: clock.now });
    eng.definePlan({
      id: 'FLAT-CB', type: 'flat', rate: 0.05, clawbackPeriodDays: 30,
    });
    eng.assignPlan('S1', 'FLAT-CB', '2026-01-01T00:00:00Z');
    eng.calculate({
      salesperson: 'S1',
      period: { from: '2026-01-01', to: '2026-01-31' },
      sales: [
        { id: 'D1', amount: 50000,
          closedDate: '2026-01-05T00:00:00Z',
          paidDate: '2026-02-20T00:00:00Z', // 46 days late
          customer: 'LateCo' },
      ],
    });
    const clawbacks = eng.applyClawback('S1',
      { from: '2026-01-01', to: '2026-05-01' });
    assert.equal(clawbacks.length, 1);
    assert.equal(clawbacks[0].amount, -2500);
    assert.equal(clawbacks[0].reason, 'paid_late');
  });

  test('26: no clawback when invoice paid within window', function () {
    const clock = fixedClock(new Date('2026-05-01').getTime());
    const eng = new CommissionEngine({ now: clock.now });
    eng.definePlan({
      id: 'FLAT-CB', type: 'flat', rate: 0.05, clawbackPeriodDays: 60,
    });
    eng.assignPlan('S1', 'FLAT-CB', '2026-01-01T00:00:00Z');
    eng.calculate({
      salesperson: 'S1',
      period: { from: '2026-01-01', to: '2026-01-31' },
      sales: [
        { id: 'D1', amount: 50000,
          closedDate: '2026-01-05T00:00:00Z',
          paidDate: '2026-02-25T00:00:00Z' }, // 51 days, OK
      ],
    });
    const clawbacks = eng.applyClawback('S1',
      { from: '2026-01-01', to: '2026-05-01' });
    assert.equal(clawbacks.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Forecast
// ─────────────────────────────────────────────────────────────

describe('commission — forecast', function () {
  test('27: forecast on pipeline uses probability weighting', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'FLAT', type: 'flat', rate: 0.10,
    });
    eng.assignPlan('S1', 'FLAT', '2026-01-01T00:00:00Z');
    const f = eng.forecast({
      salesperson: 'S1',
      pipeline: [
        { id: 'P1', amount: 100000, probability: 0.5, customer: 'Acme' },
        { id: 'P2', amount: 200000, probability: 0.25, customer: 'Globex' },
      ],
    });
    // P1 expected 50k × 10% = 5,000
    // P2 expected 50k × 10% = 5,000
    // Total 10,000
    assert.equal(f.perDeal[0].weightedCommission, 5000);
    assert.equal(f.perDeal[1].weightedCommission, 5000);
    assert.equal(f.total, 10000);
  });

  test('28: forecast on accelerator plan crosses quota', function () {
    const eng = new CommissionEngine();
    eng.definePlan({
      id: 'ACC', type: 'accelerator',
      quota: 100000, baseRate: 0.05, acceleratorRate: 0.10,
    });
    eng.assignPlan('S1', 'ACC', '2026-01-01T00:00:00Z');
    const f = eng.forecast({
      salesperson: 'S1',
      pipeline: [
        { id: 'P1', amount: 200000, probability: 1.0 },
      ],
    });
    // Expected 200k → 100k @ 5% + 100k @ 10% = 5000 + 10000 = 15000
    assert.equal(f.perDeal[0].weightedCommission, 15000);
    assert.equal(f.perDeal[0].acceleratorApplied, true);
  });
});

// ─────────────────────────────────────────────────────────────
// Suite: Statement & never-delete
// ─────────────────────────────────────────────────────────────

describe('commission — statement & never-delete', function () {
  test('29: bilingual statement includes both HE and EN blocks', function () {
    const eng = new CommissionEngine();
    eng.definePlan({ id: 'FLAT', name: 'Flat 5%', type: 'flat', rate: 0.05 });
    eng.assignPlan('S1', 'FLAT', '2026-01-01T00:00:00Z');
    eng.calculate({
      salesperson: 'S1', period: Q1_2026,
      sales: [
        { id: 'D1', amount: 100000, closedDate: '2026-02-01T00:00:00Z',
          customer: 'Acme' },
      ],
    });
    const stmt = eng.generateStatement('S1', Q1_2026);
    assert.ok(stmt.buffer);
    assert.ok(Buffer.isBuffer(stmt.buffer));
    assert.match(stmt.filename, /\.pdf$/);
    assert.equal(stmt.mime, 'application/pdf');
    // Body has both languages
    assert.match(stmt.body, /דוח עמלות/);
    assert.match(stmt.body, /COMMISSION STATEMENT/);
    assert.match(stmt.body, /Acme/);
    // Valid PDF magic
    assert.equal(stmt.buffer.slice(0, 5).toString('utf8'), '%PDF-');
  });

  test('30: never-delete — calculations log is append-only', function () {
    const eng = new CommissionEngine();
    eng.definePlan({ id: 'FLAT', type: 'flat', rate: 0.05, clawbackPeriodDays: 30 });
    eng.assignPlan('S1', 'FLAT', '2026-01-01T00:00:00Z');
    eng.calculate({
      salesperson: 'S1', period: Q1_2026,
      sales: [
        { id: 'D1', amount: 100000, closedDate: '2026-01-10T00:00:00Z',
          paidDate: null },
      ],
    });
    const before = eng.listCalculations('S1').length;
    // Attempt to mutate the returned snapshot — engine state must not change
    const snap = eng.snapshot();
    snap.calculations.length = 0;
    const after = eng.listCalculations('S1').length;
    assert.equal(before, after);
    // Engine has no deleteX functions
    assert.equal(typeof eng.deletePlan, 'undefined');
    assert.equal(typeof eng.deleteAssignment, 'undefined');
    assert.equal(typeof eng.deleteCalculation, 'undefined');
  });

  test('31: exported bilingual label maps', function () {
    assert.ok(PLAN_TYPE_LABELS.flat.he);
    assert.ok(PLAN_TYPE_LABELS.flat.en);
    assert.ok(ROLE_LABELS.seller.he);
    assert.ok(REASON_LABELS.clawback.he);
    assert.equal(REASON_LABELS.clawback.en, 'Clawback');
  });
});
