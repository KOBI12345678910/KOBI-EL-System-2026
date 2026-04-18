/**
 * Unit tests for LeaseTracker (Israeli residential + commercial leases).
 * Agent-Y047 — Real Estate / חוזי שכירות.
 *
 * Run: node --test test/realestate/lease-tracker.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LeaseTracker,
  LEASE_STATUS,
  INDEXATION_TYPES,
  GUARANTEE_TYPES,
  FAIR_RENTAL_LAW,
} = require('../../src/realestate/lease-tracker');

// ---------- Fixture builders ----------

function makeTracker() {
  return new LeaseTracker({
    cpiTable: {
      '2024-01': 100.0,
      '2024-06': 101.2,
      '2025-01': 102.8,
      '2025-06': 103.9,
      '2025-12': 105.1,
      '2026-01': 105.4,
      '2026-04': 106.0,
    },
    fxTable: {
      'USD:2024-01': 3.65,
      'USD:2025-01': 3.70,
      'USD:2025-06': 3.72,
      'USD:2026-01': 3.70,
      'USD:2026-04': 3.75,
    },
  });
}

function baseSpec(overrides = {}) {
  return Object.assign(
    {
      propertyId: 'prop-001',
      tenant: {
        name: 'Yossi Cohen',
        id: '311111118',
        phone: '050-1234567',
        address: 'Herzl 10 Tel Aviv',
      },
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2026-01-01T00:00:00Z',
      monthlyRent: 6000,
      currency: 'ILS',
      indexation: INDEXATION_TYPES.CPI,
      deposit: 12000,
      guarantors: [{ name: 'Guarantor A', id: '200000001' }],
      options: [{ type: 'renewal', notice: 90, rentChange: 0.03 }],
      purpose: 'residential',
    },
    overrides
  );
}

// =====================================================================
// createLease
// =====================================================================

test('createLease stores a valid residential lease', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  assert.ok(lease.leaseId.startsWith('lease_'));
  assert.equal(lease.status, LEASE_STATUS.ACTIVE);
  assert.equal(lease.monthlyRent, 6000);
  assert.equal(lease.indexation, INDEXATION_TYPES.CPI);
  assert.equal(lease.indexBase.type, 'cpi');
  assert.equal(lease.indexBase.value, 102.8);
});

test('createLease rejects missing property or tenant', () => {
  const t = makeTracker();
  assert.throws(() => t.createLease({ ...baseSpec(), propertyId: undefined }), /propertyId/);
  assert.throws(() => t.createLease({ ...baseSpec(), tenant: { name: '' } }), /tenant/);
});

test('createLease rejects non-positive rent', () => {
  const t = makeTracker();
  assert.throws(() => t.createLease({ ...baseSpec(), monthlyRent: 0 }), /positive/);
  assert.throws(() => t.createLease({ ...baseSpec(), monthlyRent: -100 }), /positive/);
});

test('createLease rejects endDate not after startDate', () => {
  const t = makeTracker();
  assert.throws(
    () =>
      t.createLease({
        ...baseSpec(),
        startDate: '2025-01-01',
        endDate: '2024-12-31',
      }),
    /endDate/
  );
});

test('createLease rejects invalid indexation / currency', () => {
  const t = makeTracker();
  assert.throws(() => t.createLease({ ...baseSpec(), indexation: 'moon' }), /indexation/);
  assert.throws(() => t.createLease({ ...baseSpec(), currency: 'EUR' }), /currency/);
});

test('createLease rejects deposit exceeding Fair Rental Law cap (residential)', () => {
  const t = makeTracker();
  assert.throws(
    () =>
      t.createLease({
        ...baseSpec(),
        deposit: 20000, // > 3 * 6000
      }),
    /Fair Rental Law|שכירות הוגנת/
  );
});

// =====================================================================
// computeRent — CPI indexation (תוספת הצמדה למדד)
// =====================================================================

test('computeRent applies CPI indexation correctly', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  // Jan 2025 -> base 102.8, compute for April 2026 CPI = 106.0
  const r = t.computeRent(lease.leaseId, '2026-04-01');
  assert.equal(r.indexationType, INDEXATION_TYPES.CPI);
  assert.equal(r.baseIndex, 102.8);
  assert.equal(r.currentIndex, 106.0);
  const expectedFactor = 106.0 / 102.8;
  const expectedRent = 6000 * expectedFactor;
  assert.ok(Math.abs(r.factor - Math.round((expectedFactor + Number.EPSILON) * 100) / 100) < 0.01);
  assert.ok(Math.abs(r.indexedRent - Math.round((expectedRent + Number.EPSILON) * 100) / 100) < 0.01);
  assert.match(r.formula, /currentCPI/);
  assert.match(r.hebrewFormula, /מדד/);
});

test('computeRent with no indexation returns base rent unchanged', () => {
  const t = makeTracker();
  const lease = t.createLease({
    ...baseSpec(),
    indexation: INDEXATION_TYPES.NONE,
  });
  const r = t.computeRent(lease.leaseId, '2026-04-01');
  assert.equal(r.indexedRent, 6000);
  assert.equal(r.factor, 1);
});

// =====================================================================
// computeRent — dollar-linked (צמוד דולר)
// =====================================================================

test('computeRent applies dollar-linked indexation on ILS lease', () => {
  const t = makeTracker();
  // USD rate at lease start (Jan 2025) = 3.70; April 2026 = 3.75
  const lease = t.createLease({
    ...baseSpec(),
    indexation: INDEXATION_TYPES.DOLLAR,
  });
  const r = t.computeRent(lease.leaseId, '2026-04-01');
  assert.equal(r.indexationType, INDEXATION_TYPES.DOLLAR);
  const expectedFactor = 3.75 / 3.70;
  const expectedRent = 6000 * expectedFactor;
  assert.ok(Math.abs(r.factor - Math.round((expectedFactor + Number.EPSILON) * 100) / 100) < 0.01);
  assert.ok(Math.abs(r.indexedRent - Math.round((expectedRent + Number.EPSILON) * 100) / 100) < 0.01);
  assert.match(r.formula, /USDILS/);
});

test('computeRent for USD lease stays in USD nominal', () => {
  const t = makeTracker();
  const lease = t.createLease({
    ...baseSpec(),
    currency: 'USD',
    monthlyRent: 1500,
    deposit: 4500, // within 3x cap for USD 1500 rent
    indexation: INDEXATION_TYPES.DOLLAR,
  });
  const r = t.computeRent(lease.leaseId, '2026-04-01');
  assert.equal(r.currency, 'USD');
  assert.equal(r.indexedRent, 1500);
  // ILS equivalent should reflect FX rate
  assert.ok(r.ilsEquivalent > 5000); // 1500 * 3.75 = 5625
});

// =====================================================================
// registerGuarantee
// =====================================================================

test('registerGuarantee attaches guarantees and validates type', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  const g = t.registerGuarantee({
    leaseId: lease.leaseId,
    type: GUARANTEE_TYPES.BANK_GUARANTEE,
    amount: 6000,
    expiryDate: '2027-01-01',
    reference: 'BG-001',
  });
  assert.equal(g.type, 'bank-guarantee');
  assert.equal(g.amount, 6000);
  assert.equal(g.status, 'active');
  // Lease should track it
  const refreshed = t.getLease(lease.leaseId);
  assert.ok(refreshed.guaranteeIds.includes(g.guaranteeId));
});

test('registerGuarantee rejects invalid type', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  assert.throws(
    () => t.registerGuarantee({ leaseId: lease.leaseId, type: 'magic-beans', amount: 1 }),
    /guarantee type/
  );
});

test('registerGuarantee enforces Fair Rental Law total cap', () => {
  const t = makeTracker();
  // Start with zero deposit so guarantees room = 3*6000 = 18000
  const lease = t.createLease({ ...baseSpec(), deposit: 0 });
  t.registerGuarantee({
    leaseId: lease.leaseId,
    type: GUARANTEE_TYPES.CHECK,
    amount: 12000,
  });
  // Another 6000 is at the cap — OK
  t.registerGuarantee({
    leaseId: lease.leaseId,
    type: GUARANTEE_TYPES.DEPOSIT,
    amount: 6000,
  });
  // One more token above cap — must throw
  assert.throws(
    () =>
      t.registerGuarantee({
        leaseId: lease.leaseId,
        type: GUARANTEE_TYPES.PROMISSORY_NOTE,
        amount: 1,
      }),
    /Fair Rental Law|שכירות הוגנת/
  );
});

// =====================================================================
// renewLease
// =====================================================================

test('renewLease appends to renewals and updates terms', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  const originalBaseYm = lease.indexBase.yyyyMm; // capture before mutation
  const r = t.renewLease(lease.leaseId, '2027-06-01T00:00:00Z', 6500);
  assert.equal(r.previousRent, 6000);
  assert.equal(r.newRent, 6500);
  const refreshed = t.getLease(lease.leaseId);
  assert.equal(refreshed.status, LEASE_STATUS.RENEWED);
  assert.equal(refreshed.monthlyRent, 6500);
  assert.equal(refreshed.renewals.length, 1);
  // Index base should be rebased to renewal date
  assert.notEqual(refreshed.indexBase.yyyyMm, originalBaseYm);
  assert.equal(refreshed.indexBase.yyyyMm, '2027-06');
});

test('renewLease rejects earlier endDate', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  assert.throws(
    () => t.renewLease(lease.leaseId, '2025-06-01', 6500),
    /newEndDate/
  );
});

// =====================================================================
// terminateEarly
// =====================================================================

test('terminateEarly appends termination entry without deleting lease', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  const te = t.terminateEarly(lease.leaseId, 'tenant job relocation', 3000);
  assert.equal(te.reason, 'tenant job relocation');
  assert.equal(te.penaltyAmount, 3000);
  const refreshed = t.getLease(lease.leaseId);
  assert.equal(refreshed.status, LEASE_STATUS.TERMINATED_EARLY);
  assert.equal(refreshed.terminations.length, 1);
  // Lease record must still exist (rule: לא מוחקים)
  assert.ok(t.leases.has(lease.leaseId));
});

test('terminateEarly rejects lease already terminated', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  t.terminateEarly(lease.leaseId, 'first', 0);
  assert.throws(() => t.terminateEarly(lease.leaseId, 'again', 0), /cannot terminate/);
});

// =====================================================================
// noticePeriod
// =====================================================================

test('noticePeriod returns statutory minimum for residential', () => {
  const t = makeTracker();
  const lease = t.createLease({
    ...baseSpec(),
    options: [{ type: 'renewal', notice: 30 }], // shorter than statutory
  });
  const np = t.noticePeriod(lease.leaseId);
  assert.equal(np.statutoryDays, FAIR_RENTAL_LAW.MIN_NOTICE_DAYS_RESIDENTIAL);
  assert.equal(np.effectiveDays, FAIR_RENTAL_LAW.MIN_NOTICE_DAYS_RESIDENTIAL);
});

test('noticePeriod returns contractual when longer (commercial)', () => {
  const t = makeTracker();
  const lease = t.createLease({
    ...baseSpec(),
    purpose: 'commercial',
    options: [{ type: 'renewal', notice: 180 }],
  });
  const np = t.noticePeriod(lease.leaseId);
  assert.equal(np.statutoryDays, FAIR_RENTAL_LAW.MIN_NOTICE_DAYS_COMMERCIAL);
  assert.equal(np.effectiveDays, 180);
});

// =====================================================================
// keyMoneyTracking — דיירות מוגנת
// =====================================================================

test('keyMoneyTracking marks lease as protected and computes refund', () => {
  const t = makeTracker();
  // For protected tenancy the Fair Rental cap does not apply
  const lease = t.createLease({
    ...baseSpec(),
    protectedTenancy: true,
    deposit: 0,
    monthlyRent: 2000,
  });
  const rec = t.keyMoneyTracking({
    leaseId: lease.leaseId,
    keyMoney: 90000,
    releaseDate: '2030-01-01',
    landlordShare: 1 / 3,
  });
  assert.equal(rec.keyMoney, 90000);
  assert.equal(rec.landlordRetain, 30000);
  assert.equal(rec.tenantRefund, 60000);
  const refreshed = t.getLease(lease.leaseId);
  assert.equal(refreshed.status, LEASE_STATUS.PROTECTED);
  assert.equal(refreshed.keyMoney, 90000);
});

// =====================================================================
// sheltermaxLaw (Fair Rental Law compliance)
// =====================================================================

test('sheltermaxLaw records adjustments and is append-only', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  const adj1 = t.sheltermaxLaw(lease.leaseId, {
    type: 'rent-reduction',
    delta: -300,
    effectiveFrom: '2025-06-01',
    reason: 'habitability defect repair delayed',
  });
  assert.equal(adj1.delta, -300);
  assert.ok(adj1.compliance.compliant);

  const r = t.computeRent(lease.leaseId, '2025-06-01');
  // Base rent 6000, CPI factor 103.9/102.8, plus -300 adjustment
  const cpiFactor = 103.9 / 102.8;
  const expected = 6000 * cpiFactor - 300;
  assert.ok(Math.abs(r.indexedRent - Math.round((expected + Number.EPSILON) * 100) / 100) < 0.01);

  // Appending is append-only — terminations, renewals, and adjustments must not shrink
  const snap = t.getLease(lease.leaseId);
  assert.equal(snap.fairRentalAdjustments.length, 1);
  t.sheltermaxLaw(lease.leaseId, { type: 'compliance-fine', delta: 0, reason: 'notice' });
  const snap2 = t.getLease(lease.leaseId);
  assert.equal(snap2.fairRentalAdjustments.length, 2);
});

test('sheltermaxLaw rejects unknown adjustment type', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  assert.throws(
    () => t.sheltermaxLaw(lease.leaseId, { type: 'unicorn-bonus', delta: 10 }),
    /adjustment.type/
  );
});

// =====================================================================
// generateLeaseHebrewPDF
// =====================================================================

test('generateLeaseHebrewPDF returns a well-formed PDF buffer', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  const out = t.generateLeaseHebrewPDF(lease.leaseId);
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.ok(out.buffer.length > 200);
  // PDF header + EOF marker
  assert.equal(out.buffer.slice(0, 5).toString('latin1'), '%PDF-');
  assert.match(out.buffer.toString('latin1').slice(-10), /%%EOF/);
  assert.equal(out.metadata.direction, 'rtl');
  assert.equal(out.metadata.language, 'he');
  assert.match(out.text, /HESHEM SHCHIRUT/);
  assert.match(out.text, /Yossi Cohen/);
});

// =====================================================================
// History / audit trail (לא מוחקים)
// =====================================================================

test('history captures every mutation and is never pruned', () => {
  const t = makeTracker();
  const lease = t.createLease(baseSpec());
  t.registerGuarantee({
    leaseId: lease.leaseId,
    type: GUARANTEE_TYPES.CHECK,
    amount: 1000,
  });
  t.renewLease(lease.leaseId, '2027-01-01', 6500);
  t.sheltermaxLaw(lease.leaseId, { type: 'defect-repair', delta: 0 });
  const h = t.getHistory();
  assert.ok(h.length >= 4);
  const actions = h.map((e) => e.action);
  assert.ok(actions.includes('createLease'));
  assert.ok(actions.includes('registerGuarantee'));
  assert.ok(actions.includes('renewLease'));
  assert.ok(actions.includes('sheltermaxLaw'));
});
