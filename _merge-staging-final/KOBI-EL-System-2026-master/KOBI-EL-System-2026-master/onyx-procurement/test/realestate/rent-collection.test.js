/**
 * Unit tests for src/realestate/rent-collection.js
 * Run with: node --test test/realestate/rent-collection.test.js
 *
 * Coverage:
 *   • Schedule generation (12-month lease, indexation)
 *   • recordPayment allocation across methods
 *   • Check-bank register (12+ post-dated checks, duplicate safety)
 *   • generateLateNotice — interest math, bilingual text
 *   • aging buckets 1-30 / 31-60 / 61-90 / 90+
 *   • bouncedCheckHandling — consequences, threshold, citation
 *   • standingOrderFile — rows, text, totals
 *   • tax1099 aggregation — gross, by-method, by-tenant, 10% estimate
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const rc = require('../../src/realestate/rent-collection.js');
const {
  RentCollection,
  CONSTANTS,
  LAW_CITATIONS,
  PAYMENT_METHODS,
  CHECK_STATUSES,
  _internals,
} = rc;

// ═══════════════════════════════════════════════════════════════
// Fixture helpers
// ═══════════════════════════════════════════════════════════════

const BASE_LEASE = Object.freeze({
  id: 'L-001',
  landlord: 'Uzi Cohen',
  tenant: 'Dana Levi',
  property: 'רחוב דיזנגוף 100, תל אביב',
  monthlyRent: 6000,
  currency: 'ILS',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  dayOfMonth: 1,
  graceDays: 7,
});

function freshEngine(today = '2026-04-11') {
  return new RentCollection({ today });
}

// ═══════════════════════════════════════════════════════════════
// Constants & helpers sanity
// ═══════════════════════════════════════════════════════════════

describe('constants', () => {
  test('PAYMENT_METHODS lists all six methods', () => {
    assert.deepEqual([...PAYMENT_METHODS].sort(), [
      'bit', 'cash', 'check', 'paybox', 'standing-order', 'transfer',
    ]);
  });

  test('CHECK_STATUSES has 4 values', () => {
    assert.equal(CHECK_STATUSES.length, 4);
    assert.ok(CHECK_STATUSES.includes('bounced'));
  });

  test('CONSTANTS.LATE_INTEREST_ANNUAL is 4%', () => {
    assert.equal(CONSTANTS.LATE_INTEREST_ANNUAL, 0.04);
  });

  test('BOUNCED_CHECK_THRESHOLD = 10 per חוק שיקים ללא כיסוי', () => {
    assert.equal(CONSTANTS.BOUNCED_CHECK_THRESHOLD, 10);
  });

  test('LAW_CITATIONS are bilingual', () => {
    assert.ok(LAW_CITATIONS.BOUNCED_CHECKS_LAW.he.includes('שיקים'));
    assert.ok(LAW_CITATIONS.BOUNCED_CHECKS_LAW.en.includes('Bounced'));
    assert.ok(LAW_CITATIONS.INTEREST_LAW.he.includes('ריבית'));
  });
});

describe('_internals', () => {
  test('round2 rounds to 2 dp', () => {
    assert.equal(_internals.round2(1.005), 1.01);
    assert.equal(_internals.round2(1.004), 1.0);
  });
  test('addDays forward & backward', () => {
    assert.equal(_internals.addDays('2026-01-01', 7), '2026-01-08');
    assert.equal(_internals.addDays('2026-01-01', -1), '2025-12-31');
  });
  test('addMonths clamps end-of-month', () => {
    assert.equal(_internals.addMonths('2026-01-31', 1), '2026-02-28');
  });
  test('daysBetween signed', () => {
    assert.equal(_internals.daysBetween('2026-01-01', '2026-01-11'), 10);
    assert.equal(_internals.daysBetween('2026-01-11', '2026-01-01'), -10);
  });
});

// ═══════════════════════════════════════════════════════════════
// addLease + scheduleRent
// ═══════════════════════════════════════════════════════════════

describe('addLease + scheduleRent', () => {
  test('12-month lease generates 12 rows, all 6000 ILS', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    const sched = e.scheduleRent('L-001');
    assert.equal(sched.length, 12);
    assert.equal(sched[0].period, '2026-01');
    assert.equal(sched[0].dueDate, '2026-01-01');
    assert.equal(sched[0].amount, 6000);
    assert.equal(sched[11].period, '2026-12');
    assert.equal(sched[11].cumulative, 72000);
  });

  test('indexation applies on each anniversary year', () => {
    const e = freshEngine();
    e.addLease({
      ...BASE_LEASE,
      id: 'L-IDX',
      monthlyRent: 10000,
      startDate: '2025-01-01',
      endDate:   '2027-12-31',
      indexation: 0.03,
    });
    const sched = e.scheduleRent('L-IDX');
    assert.equal(sched.length, 36);
    // 2025 → base; 2026 → +3%; 2027 → +3% compounded
    assert.equal(sched.find(r => r.period === '2025-01').amount, 10000);
    assert.equal(sched.find(r => r.period === '2026-01').amount, 10300);
    assert.equal(sched.find(r => r.period === '2027-01').amount, 10609);
  });

  test('unknown leaseId throws', () => {
    const e = freshEngine();
    assert.throws(() => e.scheduleRent('NOPE'), /Unknown leaseId/);
  });

  test('scheduled rows are frozen', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    const sched = e.scheduleRent('L-001');
    assert.throws(() => { sched[0].amount = 1; });
    assert.ok(Object.isFrozen(sched));
  });
});

// ═══════════════════════════════════════════════════════════════
// recordPayment
// ═══════════════════════════════════════════════════════════════

describe('recordPayment', () => {
  test('logs all six payment methods', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    for (const method of PAYMENT_METHODS) {
      const r = e.recordPayment({
        leaseId: 'L-001',
        period: '2026-01',
        amount: 1000,
        method,
        reference: `REF-${method}`,
        paymentDate: '2026-01-05',
      });
      assert.equal(r.method, method);
      assert.equal(r.leaseId, 'L-001');
    }
    assert.equal(e.totalPaid('L-001', '2026-01'), 6000);
  });

  test('rejects unknown method', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    assert.throws(
      () => e.recordPayment({
        leaseId: 'L-001',
        period: '2026-01',
        amount: 6000,
        method: 'bitcoin',
        paymentDate: '2026-01-05',
      }),
      /Invalid method/,
    );
  });

  test('rejects non-positive amount', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    assert.throws(
      () => e.recordPayment({
        leaseId: 'L-001',
        period: '2026-01',
        amount: 0,
        method: 'transfer',
        paymentDate: '2026-01-05',
      }),
      /positive/,
    );
  });

  test('check payment marks the check as cleared', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    e.checkBankRegister({
      leaseId: 'L-001',
      checks: [{
        number: '0001', bank: 'Leumi', branch: '800', account: '12345',
        amount: 6000, dueDate: '2026-01-01',
      }],
    });
    e.recordPayment({
      leaseId: 'L-001',
      period: '2026-01',
      amount: 6000,
      method: 'check',
      reference: '0001',
      paymentDate: '2026-01-01',
    });
    const checks = e.checks.get('L-001');
    assert.equal(checks[0].status, 'cleared');
  });
});

// ═══════════════════════════════════════════════════════════════
// checkBankRegister — 12+ post-dated checks typical in Israeli leases
// ═══════════════════════════════════════════════════════════════

describe('checkBankRegister', () => {
  function twelveChecks() {
    return Array.from({ length: 12 }, (_, i) => ({
      number: String(1000 + i),
      bank: 'Leumi',
      branch: '800',
      account: '12345',
      amount: 6000,
      dueDate: `2026-${String(i + 1).padStart(2, '0')}-01`,
    }));
  }

  test('registers 12 post-dated checks', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    const out = e.checkBankRegister({
      leaseId: 'L-001',
      checks: twelveChecks(),
    });
    assert.equal(out.length, 12);
    assert.equal(out[0].number, '1000');
    assert.equal(out[11].number, '1011');
    out.forEach(c => assert.equal(c.status, 'pending'));
  });

  test('sorts by dueDate regardless of insert order', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    const shuffled = twelveChecks().slice().reverse();
    const out = e.checkBankRegister({ leaseId: 'L-001', checks: shuffled });
    const dueDates = out.map(c => c.dueDate);
    const sorted = dueDates.slice().sort();
    assert.deepEqual(dueDates, sorted);
  });

  test('duplicate numbers upgrade status, never delete', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    e.checkBankRegister({ leaseId: 'L-001', checks: twelveChecks() });
    e.checkBankRegister({
      leaseId: 'L-001',
      checks: [{
        number: '1000', bank: 'Leumi', branch: '800', account: '12345',
        amount: 6000, dueDate: '2026-01-01', status: 'cleared',
      }],
    });
    const c = e.checks.get('L-001').find(x => x.number === '1000');
    assert.equal(c.status, 'cleared');
    assert.equal(e.checks.get('L-001').length, 12, 'never grows past 12');
  });

  test('rejects malformed check entries', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    assert.throws(
      () => e.checkBankRegister({
        leaseId: 'L-001',
        checks: [{ bank: 'Leumi', amount: 6000, dueDate: '2026-01-01' }],
      }),
      /number/,
    );
    assert.throws(
      () => e.checkBankRegister({
        leaseId: 'L-001',
        checks: [{ number: '1', bank: 'Leumi', amount: -10, dueDate: '2026-01-01' }],
      }),
      /positive/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// generateLateNotice — bilingual + compounding interest
// ═══════════════════════════════════════════════════════════════

describe('generateLateNotice', () => {
  test('no interest when period is not yet late', () => {
    const e = freshEngine('2026-01-05'); // within grace period
    e.addLease(BASE_LEASE);
    const notice = e.generateLateNotice('L-001', '2026-01');
    assert.equal(notice.daysLate, 0);
    assert.equal(notice.interest, 0);
    assert.equal(notice.outstanding, 6000);
    assert.equal(notice.totalDue, 6000);
  });

  test('daysLate starts the day after grace ends', () => {
    const e = freshEngine('2026-01-09'); // grace ends 2026-01-08, today = 09
    e.addLease(BASE_LEASE);
    const n = e.generateLateNotice('L-001', '2026-01');
    assert.equal(n.daysLate, 1);
    assert.ok(n.interest > 0);
    assert.ok(n.interest < 1); // a single day of 4% on 6000 is cents
  });

  test('interest compounds over 30 days', () => {
    const e = freshEngine('2026-02-07'); // grace ended 2026-01-08; today - that = 30 days
    e.addLease(BASE_LEASE);
    const n = e.generateLateNotice('L-001', '2026-01');
    assert.equal(n.daysLate, 30);
    // ~ 6000 * ((1.04)^(30/365) - 1) ≈ 19.37 ILS
    assert.ok(n.interest > 19);
    assert.ok(n.interest < 21);
    assert.equal(n.totalDue, _internals.round2(n.outstanding + n.interest));
  });

  test('outstanding reduces by partial payment', () => {
    const e = freshEngine('2026-02-07');
    e.addLease(BASE_LEASE);
    e.recordPayment({
      leaseId: 'L-001',
      period: '2026-01',
      amount: 4000,
      method: 'transfer',
      reference: 'TXN-1',
      paymentDate: '2026-01-03',
    });
    const n = e.generateLateNotice('L-001', '2026-01');
    assert.equal(n.outstanding, 2000);
    // Interest on the remaining 2000 only
    assert.ok(n.interest > 6);
    assert.ok(n.interest < 8);
  });

  test('notice text is bilingual and cites both laws', () => {
    const e = freshEngine('2026-02-07');
    e.addLease(BASE_LEASE);
    const n = e.generateLateNotice('L-001', '2026-01');
    assert.ok(n.text.he.includes('התראת פיגור'));
    assert.ok(n.text.he.includes('ריבית פיגורים'));
    assert.ok(n.text.he.includes('חוק השכירות'));
    assert.ok(n.text.en.includes('RENT PAYMENT LATE NOTICE'));
    assert.ok(n.text.en.includes('Interest Adjudication'));
  });

  test('unknown period throws', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    assert.throws(
      () => e.generateLateNotice('L-001', '2099-12'),
      /not in lease/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// aging — 1-30 / 31-60 / 61-90 / 90+
// ═══════════════════════════════════════════════════════════════

describe('aging', () => {
  test('single tenant, four overdue periods hit each bucket', () => {
    // today = 2026-04-11
    // Jan 1 + 7 grace = Jan 8 → 93 days late → 90+
    // Feb 1 + 7 grace = Feb 8 → 62 days late → 61-90
    // Mar 1 + 7 grace = Mar 8 → 34 days late → 31-60
    // Apr 1 + 7 grace = Apr 8 → 3  days late → 1-30
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    const rep = e.aging('Uzi Cohen');
    assert.equal(rep.totals.count, 4);
    assert.equal(rep.bucket_1_30.count, 1);
    assert.equal(rep.bucket_31_60.count, 1);
    assert.equal(rep.bucket_61_90.count, 1);
    assert.equal(rep.bucket_90_plus.count, 1);
    assert.equal(rep.totals.amount, 24000);
  });

  test('paid periods drop out of aging', () => {
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    e.recordPayment({
      leaseId: 'L-001', period: '2026-01', amount: 6000,
      method: 'transfer', paymentDate: '2026-01-02',
    });
    e.recordPayment({
      leaseId: 'L-001', period: '2026-02', amount: 6000,
      method: 'transfer', paymentDate: '2026-02-02',
    });
    const rep = e.aging('Uzi Cohen');
    assert.equal(rep.totals.count, 2); // Mar + Apr remain
    assert.equal(rep.bucket_1_30.count, 1);
    assert.equal(rep.bucket_31_60.count, 1);
  });

  test('aging filters by landlord', () => {
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    e.addLease({ ...BASE_LEASE, id: 'L-OTHER', landlord: 'Other Landlord' });
    const rep = e.aging('Uzi Cohen');
    rep.details.forEach(d => assert.equal(d.leaseId, 'L-001'));
    const other = e.aging('Other Landlord');
    assert.equal(other.totals.count, 4);
  });

  test('future-dated periods are excluded', () => {
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    const rep = e.aging('Uzi Cohen');
    // Only Jan-Apr should show; May-Dec are in the future
    const hasFuture = rep.details.some(d => d.period >= '2026-05');
    assert.equal(hasFuture, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// bouncedCheckHandling
// ═══════════════════════════════════════════════════════════════

describe('bouncedCheckHandling', () => {
  test('first bounce marks status, low risk', () => {
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    e.checkBankRegister({
      leaseId: 'L-001',
      checks: [{
        number: '0001', bank: 'Leumi', branch: '800', account: '12345',
        amount: 6000, dueDate: '2026-04-01',
      }],
    });
    const r = e.bouncedCheckHandling('0001');
    assert.equal(r.status, 'bounced');
    assert.equal(r.countInWindow, 1);
    assert.equal(r.restrictedRisk, false);
    assert.ok(r.suggestedActions.length >= 4);
    assert.ok(r.legalCitation.he.includes('שיקים ללא כיסוי'));
  });

  test('10 bounced checks in 12 months flips restrictedRisk', () => {
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    const checks = Array.from({ length: 10 }, (_, i) => ({
      number: `B${i}`,
      bank: 'Leumi',
      branch: '800',
      account: '12345',
      amount: 6000,
      dueDate: `2026-${String(i + 1).padStart(2, '0')}-01`,
    }));
    e.checkBankRegister({ leaseId: 'L-001', checks });
    let lastResult;
    for (const c of checks) {
      lastResult = e.bouncedCheckHandling(c.number);
    }
    assert.equal(lastResult.countInWindow, 10);
    assert.equal(lastResult.restrictedRisk, true);
    const codes = lastResult.suggestedActions.map(a => a.code);
    assert.ok(codes.includes('REPORT_RESTRICTED_CUSTOMER'));
  });

  test('unknown check throws', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    assert.throws(() => e.bouncedCheckHandling('BOGUS'), /not found/);
  });
});

// ═══════════════════════════════════════════════════════════════
// standingOrderFile
// ═══════════════════════════════════════════════════════════════

describe('standingOrderFile', () => {
  test('emits rows for pending checks at a specific bank', () => {
    const e = freshEngine('2026-01-01');
    e.addLease(BASE_LEASE);
    e.checkBankRegister({
      leaseId: 'L-001',
      checks: [
        { number: 'A1', bank: 'Leumi', branch: '800', account: '1',
          amount: 6000, dueDate: '2026-02-01' },
        { number: 'A2', bank: 'Hapoalim', branch: '600', account: '2',
          amount: 6000, dueDate: '2026-03-01' },
      ],
    });
    const out = e.standingOrderFile('Leumi');
    assert.equal(out.count, 1);
    assert.equal(out.totalAmount, 6000);
    assert.equal(out.rows[0].bank, 'Leumi');
    assert.ok(out.text.includes('STANDING ORDER BATCH'));
    assert.ok(out.text.includes('Leumi'));
  });

  test('bank=undefined emits all pending checks', () => {
    const e = freshEngine('2026-01-01');
    e.addLease(BASE_LEASE);
    e.checkBankRegister({
      leaseId: 'L-001',
      checks: [
        { number: 'A1', bank: 'Leumi', branch: '800', account: '1',
          amount: 6000, dueDate: '2026-02-01' },
        { number: 'A2', bank: 'Hapoalim', branch: '600', account: '2',
          amount: 6000, dueDate: '2026-03-01' },
      ],
    });
    const out = e.standingOrderFile();
    assert.equal(out.count, 2);
    assert.equal(out.totalAmount, 12000);
  });

  test('falls back to schedule rows when no matching checks', () => {
    const e = freshEngine('2026-01-01');
    e.addLease(BASE_LEASE);
    const out = e.standingOrderFile('Discount');
    assert.ok(out.count >= 12);
    assert.ok(out.rows.every(r => r.type === 'standing-order'));
  });
});

// ═══════════════════════════════════════════════════════════════
// tax1099 — annual income summary
// ═══════════════════════════════════════════════════════════════

describe('tax1099', () => {
  test('aggregates full year across methods and tenants', () => {
    const e = freshEngine('2026-04-11');
    e.addLease(BASE_LEASE);
    e.addLease({ ...BASE_LEASE, id: 'L-002', tenant: 'Avi B.', monthlyRent: 4000 });

    // Lease 1: three months of checks + one transfer
    e.recordPayment({ leaseId: 'L-001', period: '2026-01', amount: 6000,
      method: 'check', reference: 'C-1', paymentDate: '2026-01-01' });
    e.recordPayment({ leaseId: 'L-001', period: '2026-02', amount: 6000,
      method: 'check', reference: 'C-2', paymentDate: '2026-02-01' });
    e.recordPayment({ leaseId: 'L-001', period: '2026-03', amount: 6000,
      method: 'check', reference: 'C-3', paymentDate: '2026-03-01' });
    e.recordPayment({ leaseId: 'L-001', period: '2026-04', amount: 6000,
      method: 'transfer', reference: 'TXN-4', paymentDate: '2026-04-01' });

    // Lease 2: two months of Bit + one Paybox
    e.recordPayment({ leaseId: 'L-002', period: '2026-01', amount: 4000,
      method: 'bit', reference: 'BIT-1', paymentDate: '2026-01-01' });
    e.recordPayment({ leaseId: 'L-002', period: '2026-02', amount: 4000,
      method: 'bit', reference: 'BIT-2', paymentDate: '2026-02-01' });
    e.recordPayment({ leaseId: 'L-002', period: '2026-03', amount: 4000,
      method: 'paybox', reference: 'PBX-1', paymentDate: '2026-03-01' });

    const rep = e.tax1099('2026');
    assert.equal(rep.periodType, 'year');
    assert.equal(rep.count, 1); // one landlord

    const r = rep.reports[0];
    assert.equal(r.landlord, 'Uzi Cohen');
    assert.equal(r.grossRental, 24000 + 12000);
    assert.equal(r.byMethod.check, 18000);
    assert.equal(r.byMethod.transfer, 6000);
    assert.equal(r.byMethod.bit, 8000);
    assert.equal(r.byMethod.paybox, 4000);
    assert.equal(r.paymentCount, 7);

    // 10% regime — section 122
    assert.equal(r.estimatedTaxSection122, 3600);
    assert.ok(r.citation.he.includes('מס הכנסה'));
    assert.ok(r.citation.en.includes('Income Tax'));

    // Two tenants
    assert.equal(r.byTenant.length, 2);
    const dana = r.byTenant.find(t => t.tenant === 'Dana Levi');
    const avi = r.byTenant.find(t => t.tenant === 'Avi B.');
    assert.equal(dana.amount, 24000);
    assert.equal(avi.amount, 12000);
  });

  test('month-scoped period returns only that month', () => {
    const e = freshEngine();
    e.addLease(BASE_LEASE);
    e.recordPayment({ leaseId: 'L-001', period: '2026-01', amount: 6000,
      method: 'transfer', paymentDate: '2026-01-02' });
    e.recordPayment({ leaseId: 'L-001', period: '2026-02', amount: 6000,
      method: 'transfer', paymentDate: '2026-02-02' });
    const rep = e.tax1099('2026-01');
    assert.equal(rep.periodType, 'month');
    assert.equal(rep.reports[0].grossRental, 6000);
  });

  test('rejects malformed period', () => {
    const e = freshEngine();
    assert.throws(() => e.tax1099('26'), /YYYY or YYYY-MM/);
    assert.throws(() => e.tax1099(null), /required/);
  });
});

// ═══════════════════════════════════════════════════════════════
// End-to-end smoke test — the "typical" Israeli rental flow
// ═══════════════════════════════════════════════════════════════

describe('end-to-end smoke', () => {
  test('12 post-dated checks + partial bounces + late notice + 1099', () => {
    const e = freshEngine('2026-05-15');
    e.addLease(BASE_LEASE);

    // Register 12 post-dated checks
    const checks = Array.from({ length: 12 }, (_, i) => ({
      number: `C${String(i + 1).padStart(3, '0')}`,
      bank: 'Leumi',
      branch: '800',
      account: '98765',
      amount: 6000,
      dueDate: `2026-${String(i + 1).padStart(2, '0')}-01`,
    }));
    e.checkBankRegister({ leaseId: 'L-001', checks });

    // January + February cleared
    e.recordPayment({ leaseId: 'L-001', period: '2026-01', amount: 6000,
      method: 'check', reference: 'C001', paymentDate: '2026-01-01' });
    e.recordPayment({ leaseId: 'L-001', period: '2026-02', amount: 6000,
      method: 'check', reference: 'C002', paymentDate: '2026-02-01' });

    // March bounced
    const bounced = e.bouncedCheckHandling('C003');
    assert.equal(bounced.status, 'bounced');

    // April paid late by transfer
    e.recordPayment({ leaseId: 'L-001', period: '2026-04', amount: 6000,
      method: 'transfer', reference: 'TXN-APR', paymentDate: '2026-04-20' });

    // Aging: Mar still outstanding (~68 days late), May not yet cleared
    const aging = e.aging('Uzi Cohen');
    assert.ok(aging.totals.count >= 2);
    assert.ok(aging.totals.amount >= 12000);

    // Late notice for March
    const notice = e.generateLateNotice('L-001', '2026-03');
    assert.ok(notice.daysLate > 60);
    assert.ok(notice.interest > 0);
    assert.ok(notice.text.he.length > 100);

    // 1099 YTD
    const tax = e.tax1099('2026');
    assert.equal(tax.reports[0].grossRental, 18000); // Jan+Feb+Apr
    assert.equal(tax.reports[0].estimatedTaxSection122, 1800);
  });
});
