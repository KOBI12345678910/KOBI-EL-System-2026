/**
 * Tests for BrokerFeeTracker
 * Zero-dep test runner (node --test compatible + standalone runnable)
 *
 * Covers:
 *  - broker registration & version upgrade (rule: no deletion)
 *  - license format + expiry validation
 *  - exclusivity agreement signing (§ 9 written form, marketing actions)
 *  - showing log append-only
 *  - commission calculation with VAT (sale 2%, rental 1 month)
 *  - cap enforcement (E_RATE_EXCEEDS_CAP)
 *  - split between buyer/seller sides
 *  - claim creation, dispute handling, resolution
 *  - invoice generation with allocation number
 *  - license renewal alerts
 *  - non-deletion invariants (no delete* methods exposed)
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — verified via history/version checks.
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  BrokerFeeTracker,
  VAT_RATE,
  SALE_CAP_PCT,
  RENTAL_CAP_MONTHS,
  TRANSACTION_TYPES,
  EXCLUSIVITY_TYPES,
  SHOWING_OUTCOMES,
  CLAIM_STATUSES,
  DISPUTE_STATUSES,
} = require('../../src/realestate/broker-fees.js');

// ---------- helpers ---------------------------------------------------------

// Fixed "now" — 2026-04-11 as per env context.
const FIXED_NOW = new Date('2026-04-11T09:00:00Z');
function now() { return new Date(FIXED_NOW); }

function seededTracker() {
  const t = new BrokerFeeTracker({ now });
  t.registerBroker({
    id: 'BRK-01',
    name: 'דוד כהן',
    licenseNumber: '123456',
    licenseExpiry: '2027-01-01',
    phone: '052-1234567',
    email: 'david@broker.co.il',
  });
  t.registerBroker({
    id: 'BRK-02',
    name: 'Maya Levi',
    licenseNumber: '789012',
    licenseExpiry: '2026-04-25', // 14 days from FIXED_NOW
    phone: '052-9999999',
    email: 'maya@broker.co.il',
  });
  return t;
}

// ---------- registerBroker ---------------------------------------------------

test('registerBroker stores a broker with version=1', () => {
  const t = new BrokerFeeTracker({ now });
  const b = t.registerBroker({
    id: 'BRK-X',
    name: 'Test Broker',
    licenseNumber: '555000',
    licenseExpiry: '2027-12-31',
  });
  assert.equal(b.id, 'BRK-X');
  assert.equal(b.version, 1);
  assert.equal(b.licenseNumber, '555000');
});

test('registerBroker upgrades existing broker, preserving old version in history', () => {
  const t = new BrokerFeeTracker({ now });
  t.registerBroker({ id: 'B1', name: 'Old Name', licenseNumber: '111111', licenseExpiry: '2027-01-01' });
  const v2 = t.registerBroker({
    id: 'B1', name: 'New Name', licenseNumber: '111111', licenseExpiry: '2028-01-01',
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.name, 'New Name');
  const hist = t.brokerHistory('B1');
  assert.equal(hist.length, 1);
  assert.equal(hist[0].record.name, 'Old Name');
});

test('registerBroker rejects missing license number', () => {
  const t = new BrokerFeeTracker({ now });
  assert.throws(
    () => t.registerBroker({ id: 'X', name: 'Y', licenseExpiry: '2027-01-01' }),
    /E_MISSING_BROKER_LICENSENUMBER/
  );
});

test('registerBroker rejects malformed license number', () => {
  const t = new BrokerFeeTracker({ now });
  assert.throws(
    () => t.registerBroker({ id: 'X', name: 'Y', licenseNumber: 'abc', licenseExpiry: '2027-01-01' }),
    /E_INVALID_LICENSE_FORMAT/
  );
});

// ---------- signExclusivity --------------------------------------------------

test('signExclusivity records a valid hafnayat-nechesh agreement', () => {
  const t = seededTracker();
  const rec = t.signExclusivity({
    propertyId: 'PROP-1',
    broker: 'BRK-01',
    startDate: '2026-04-11',
    endDate:   '2026-07-11',
    exclusiveType: 'hafnayat-nechesh',
    marketingActions: ['online-listing', 'open-house'],
    customer: { name: 'יוסי ישראל', id: '012345678' },
  });
  assert.equal(rec.version, 1);
  assert.equal(rec.exclusiveType, 'hafnayat-nechesh');
  assert.equal(rec.brokerLicense, '123456');
  assert.equal(rec.marketingActions.length, 2);
});

test('signExclusivity rejects invalid exclusivity type', () => {
  const t = seededTracker();
  assert.throws(
    () => t.signExclusivity({
      propertyId: 'PROP-1', broker: 'BRK-01',
      startDate: '2026-04-11', endDate: '2026-07-11',
      exclusiveType: 'bogus-type',
      marketingActions: ['a', 'b'],
    }),
    /E_INVALID_EXCLUSIVITY_TYPE/
  );
});

test('signExclusivity requires at least 2 marketing actions when exclusivity != none', () => {
  const t = seededTracker();
  assert.throws(
    () => t.signExclusivity({
      propertyId: 'PROP-1', broker: 'BRK-01',
      startDate: '2026-04-11', endDate: '2026-07-11',
      exclusiveType: 'seker-mochrit',
      marketingActions: ['one-only'],
    }),
    /E_EXCLUSIVITY_REQUIRES_TWO_ACTIONS/
  );
});

test("signExclusivity accepts 'none' without marketing actions", () => {
  const t = seededTracker();
  const rec = t.signExclusivity({
    propertyId: 'PROP-9', broker: 'BRK-01',
    startDate: '2026-04-11', endDate: '2026-05-11',
    exclusiveType: 'none',
    customer: { name: 'x', id: '123456789' },
  });
  assert.equal(rec.exclusiveType, 'none');
});

test('signExclusivity rejects end-before-start', () => {
  const t = seededTracker();
  assert.throws(
    () => t.signExclusivity({
      propertyId: 'PROP-2', broker: 'BRK-01',
      startDate: '2026-07-11', endDate: '2026-04-11',
      exclusiveType: 'hafnayat-nechesh',
      marketingActions: ['a', 'b'],
    }),
    /E_END_DATE_BEFORE_START/
  );
});

test('signExclusivity upgrades existing agreement, preserves previous in history', () => {
  const t = seededTracker();
  t.signExclusivity({
    propertyId: 'PROP-3', broker: 'BRK-01',
    startDate: '2026-04-11', endDate: '2026-05-11',
    exclusiveType: 'seker-mochrit',
    marketingActions: ['a', 'b'],
  });
  const v2 = t.signExclusivity({
    propertyId: 'PROP-3', broker: 'BRK-02',
    startDate: '2026-05-12', endDate: '2026-08-12',
    exclusiveType: 'hafnayat-nechesh',
    marketingActions: ['x', 'y', 'z'],
  });
  assert.equal(v2.version, 2);
  assert.equal(t.agreementHistory('PROP-3').length, 1);
  assert.equal(t.agreementHistory('PROP-3')[0].record.broker, 'BRK-01');
});

// ---------- logShowing -------------------------------------------------------

test('logShowing appends to the showings list', () => {
  const t = seededTracker();
  const s1 = t.logShowing({
    propertyId: 'PROP-1', broker: 'BRK-01',
    visitor: 'דני לוי',
    date: '2026-04-12',
    outcome: 'consider',
  });
  const s2 = t.logShowing({
    propertyId: 'PROP-1', broker: 'BRK-01',
    visitor: { name: 'שרה כהן', phone: '050-1111111' },
    date: '2026-04-13',
    outcome: 'offer',
  });
  assert.equal(s1.id, 'SHOW-000001');
  assert.equal(s2.id, 'SHOW-000002');
  const all = t.showingsForProperty('PROP-1');
  assert.equal(all.length, 2);
});

test('logShowing rejects unknown broker and invalid outcome', () => {
  const t = seededTracker();
  assert.throws(
    () => t.logShowing({
      propertyId: 'PROP-1', broker: 'XXXX',
      visitor: 'a', date: '2026-04-12', outcome: 'consider',
    }),
    /E_BROKER_NOT_FOUND/
  );
  assert.throws(
    () => t.logShowing({
      propertyId: 'PROP-1', broker: 'BRK-01',
      visitor: 'a', date: '2026-04-12', outcome: 'huh',
    }),
    /E_INVALID_SHOWING_OUTCOME/
  );
});

// ---------- computeCommission -----------------------------------------------

test('computeCommission sale @2% adds 17% VAT', () => {
  const t = seededTracker();
  const r = t.computeCommission({
    transactionType: 'sale',
    price: 2_500_000,
    rate: 0.02,
  });
  // gross = 50,000; vat = 8,500; total = 58,500
  assert.equal(r.gross, 50000);
  assert.equal(r.vat,   8500);
  assert.equal(r.total, 58500);
  assert.equal(r.vatRate, 0.17);
  assert.equal(r.cap, 0.02);
});

test('computeCommission sale rejects rate > cap', () => {
  const t = seededTracker();
  assert.throws(
    () => t.computeCommission({ transactionType: 'sale', price: 1_000_000, rate: 0.025 }),
    /E_RATE_EXCEEDS_CAP/
  );
});

test('computeCommission rental 1 month @ rate 1 equals one month rent + VAT', () => {
  const t = seededTracker();
  const r = t.computeCommission({
    transactionType: 'rental',
    price: 5000,   // monthly rent
    rate: 1,
  });
  assert.equal(r.gross, 5000);
  assert.equal(r.vat, 850);   // 17%
  assert.equal(r.total, 5850);
});

test('computeCommission rental rejects rate > 1 month', () => {
  const t = seededTracker();
  assert.throws(
    () => t.computeCommission({ transactionType: 'rental', price: 5000, rate: 1.5 }),
    /E_RATE_EXCEEDS_CAP/
  );
});

test('computeCommission with split returns per-side breakdown', () => {
  const t = seededTracker();
  const r = t.computeCommission({
    transactionType: 'sale',
    price: 1_000_000,
    rate: 0.02,
    split: { buyer: 0.5, seller: 0.5 },
  });
  assert.equal(r.gross, 20000);
  assert.equal(r.perSide.buyer.gross, 10000);
  assert.equal(r.perSide.seller.gross, 10000);
  assert.equal(r.perSide.buyer.total, 11700);
});

test('computeCommission with bad split throws E_SPLIT_NOT_100', () => {
  const t = seededTracker();
  assert.throws(
    () => t.computeCommission({
      transactionType: 'sale', price: 1_000_000, rate: 0.02,
      split: { buyer: 0.6, seller: 0.3 },
    }),
    /E_SPLIT_NOT_100/
  );
});

test('computeCommission rejects invalid transaction type', () => {
  const t = seededTracker();
  assert.throws(
    () => t.computeCommission({ transactionType: 'auction', price: 100, rate: 0.01 }),
    /E_INVALID_TRANSACTION_TYPE/
  );
});

// ---------- claimCommission --------------------------------------------------

test('claimCommission creates a record with gross + VAT', () => {
  const t = seededTracker();
  const c = t.claimCommission({
    saleId: 'SALE-1',
    broker: 'BRK-01',
    buyerBrokerPct: 0.02,
    sellerBrokerPct: 0.02,
    price: 2_000_000,
  });
  // buyerGross=40k, sellerGross=40k, gross=80k, vat=13.6k, total=93.6k
  assert.equal(c.buyerGross, 40000);
  assert.equal(c.sellerGross, 40000);
  assert.equal(c.gross, 80000);
  assert.equal(c.vat, 13600);
  assert.equal(c.total, 93600);
  assert.equal(c.status, 'open');
});

test('claimCommission rejects claim from expired-license broker', () => {
  const t = new BrokerFeeTracker({ now });
  t.registerBroker({
    id: 'OLD', name: 'Expired', licenseNumber: '444444',
    licenseExpiry: '2025-01-01',
  });
  assert.throws(
    () => t.claimCommission({
      saleId: 'S', broker: 'OLD', price: 1_000_000, buyerBrokerPct: 0.01,
    }),
    /E_LICENSE_EXPIRED/
  );
});

test('claimCommission rejects when both sides are zero', () => {
  const t = seededTracker();
  assert.throws(
    () => t.claimCommission({ saleId: 'S', broker: 'BRK-01', price: 1_000_000 }),
    /E_EMPTY_COMMISSION_CLAIM/
  );
});

test('claimCommission rejects rate above cap', () => {
  const t = seededTracker();
  assert.throws(
    () => t.claimCommission({
      saleId: 'S', broker: 'BRK-01', price: 1_000_000, buyerBrokerPct: 0.03,
    }),
    /E_RATE_EXCEEDS_CAP/
  );
});

// ---------- validateAgreement ------------------------------------------------

test('validateAgreement returns valid for a properly-formed agreement', () => {
  const t = seededTracker();
  t.signExclusivity({
    propertyId: 'PROP-V', broker: 'BRK-01',
    startDate: '2026-04-11', endDate: '2026-07-11',
    exclusiveType: 'hafnayat-nechesh',
    marketingActions: ['a', 'b'],
    customer: { name: 'x', id: '111222333' },
  });
  const v = t.validateAgreement('PROP-V');
  assert.equal(v.valid, true);
  assert.equal(v.errors.length, 0);
});

test('validateAgreement flags missing customer and not-in-writing', () => {
  const t = seededTracker();
  t.signExclusivity({
    propertyId: 'PROP-NW', broker: 'BRK-01',
    startDate: '2026-04-11', endDate: '2026-07-11',
    exclusiveType: 'hafnayat-nechesh',
    marketingActions: ['a', 'b'],
    writtenSigned: false,
  });
  const v = t.validateAgreement('PROP-NW');
  assert.equal(v.valid, false);
  assert.ok(v.errors.includes('E_NOT_IN_WRITING'));
  assert.ok(v.errors.includes('E_MISSING_CUSTOMER'));
});

test('validateAgreement flags expired broker license', () => {
  const t = new BrokerFeeTracker({ now });
  t.registerBroker({
    id: 'EXP', name: 'Past',
    licenseNumber: '999000', licenseExpiry: '2025-12-31',
  });
  t.signExclusivity({
    propertyId: 'PROP-E', broker: 'EXP',
    startDate: '2026-04-11', endDate: '2026-07-11',
    exclusiveType: 'hafnayat-nechesh',
    marketingActions: ['a', 'b'],
    customer: { name: 'x', id: '111' },
  });
  const v = t.validateAgreement('PROP-E');
  assert.equal(v.valid, false);
  assert.ok(v.errors.includes('E_LICENSE_EXPIRED'));
});

test('validateAgreement returns E_AGREEMENT_NOT_FOUND on missing record', () => {
  const t = seededTracker();
  const v = t.validateAgreement('NOPE');
  assert.equal(v.valid, false);
  assert.ok(v.errors.includes('E_AGREEMENT_NOT_FOUND'));
});

// ---------- disputes ---------------------------------------------------------

test('openDispute marks both claims as DISPUTED and retains history', () => {
  const t = seededTracker();
  const c1 = t.claimCommission({
    saleId: 'S1', broker: 'BRK-01', price: 1_000_000, buyerBrokerPct: 0.02,
  });
  const c2 = t.claimCommission({
    saleId: 'S1', broker: 'BRK-02', price: 1_000_000, sellerBrokerPct: 0.02,
  });
  const d = t.openDispute({ claimIds: [c1.id, c2.id], reason: 'Both claim effective cause' });
  assert.equal(d.status, 'open');
  assert.equal(d.claimIds.length, 2);
  assert.equal(t.getClaim(c1.id).status, 'disputed');
  assert.equal(t.getClaim(c2.id).status, 'disputed');
  // history retained
  assert.equal(t.claimHistoryOf(c1.id).length, 1);
  assert.equal(t.claimHistoryOf(c2.id).length, 1);
});

test('resolveDispute picks a winner; loser becomes REJECTED but not deleted', () => {
  const t = seededTracker();
  const c1 = t.claimCommission({
    saleId: 'S2', broker: 'BRK-01', price: 1_000_000, buyerBrokerPct: 0.02,
  });
  const c2 = t.claimCommission({
    saleId: 'S2', broker: 'BRK-02', price: 1_000_000, buyerBrokerPct: 0.015,
  });
  const d = t.openDispute({ claimIds: [c1.id, c2.id] });
  const r = t.resolveDispute(d.id, c1.id, 'BRK-01 was effective cause');
  assert.equal(r.status, 'resolved');
  assert.equal(r.winnerClaimId, c1.id);
  assert.equal(t.getClaim(c1.id).status, 'open');
  assert.equal(t.getClaim(c2.id).status, 'rejected');
  // Both claims still exist — nothing deleted.
  assert.ok(t.getClaim(c1.id));
  assert.ok(t.getClaim(c2.id));
});

test('disputes() lookup by claim id returns matching disputes', () => {
  const t = seededTracker();
  const c1 = t.claimCommission({
    saleId: 'S3', broker: 'BRK-01', price: 1_000_000, buyerBrokerPct: 0.02,
  });
  const c2 = t.claimCommission({
    saleId: 'S3', broker: 'BRK-02', price: 1_000_000, buyerBrokerPct: 0.018,
  });
  t.openDispute({ claimIds: [c1.id, c2.id] });
  const result = t.disputes(c1.id);
  assert.equal(result.length, 1);
  assert.ok(result[0].claimIds.includes(c1.id));
});

// ---------- generateInvoice --------------------------------------------------

test('generateInvoice produces a bilingual invoice with allocation number', () => {
  const t = seededTracker();
  const c = t.claimCommission({
    saleId: 'S-INV-1', broker: 'BRK-01', price: 3_000_000,
    buyerBrokerPct: 0.02, sellerBrokerPct: 0.02,
  });
  const inv = t.generateInvoice(c.id);
  assert.ok(inv.id.startsWith('INV-BRK-'));
  assert.equal(inv.broker.licenseNumber, '123456');
  assert.equal(inv.lines.length, 2);
  assert.equal(inv.gross, 120000); // 60k buyer + 60k seller
  assert.equal(inv.vat, 20400);     // 17% of 120k
  assert.equal(inv.total, 140400);
  assert.ok(inv.allocationNumber && inv.allocationNumber.startsWith('IL'));
  assert.ok(inv.headings.he && inv.headings.en);
  // claim marked invoiced
  assert.equal(t.getClaim(c.id).status, 'invoiced');
  // history retained
  assert.ok(t.claimHistoryOf(c.id).length >= 1);
});

test('generateInvoice refuses disputed claims', () => {
  const t = seededTracker();
  const c1 = t.claimCommission({
    saleId: 'S-D', broker: 'BRK-01', price: 1_000_000, buyerBrokerPct: 0.02,
  });
  const c2 = t.claimCommission({
    saleId: 'S-D', broker: 'BRK-02', price: 1_000_000, buyerBrokerPct: 0.02,
  });
  t.openDispute({ claimIds: [c1.id, c2.id] });
  assert.throws(() => t.generateInvoice(c1.id), /E_CLAIM_DISPUTED/);
});

// ---------- licenseRenewalAlert ----------------------------------------------

test('licenseRenewalAlert(30) returns brokers expiring within 30 days', () => {
  const t = seededTracker();
  // BRK-02 expires 2026-04-25; FIXED_NOW is 2026-04-11T09:00Z → ~13 days
  const alerts = t.licenseRenewalAlert(30);
  const ids = alerts.map(a => a.id);
  assert.ok(ids.includes('BRK-02'));
  assert.ok(!ids.includes('BRK-01')); // BRK-01 expires 2027-01-01
  const a = alerts.find(x => x.id === 'BRK-02');
  // daysLeft is floor of the difference — accept 13 or 14 depending on TZ
  assert.ok(a.daysLeft >= 13 && a.daysLeft <= 14);
  assert.equal(a.expired, false);
  assert.ok(a.message.he.includes(String(a.daysLeft)));
  assert.ok(a.message.en.includes(String(a.daysLeft)));
});

test('licenseRenewalAlert flags expired licenses', () => {
  const t = new BrokerFeeTracker({ now });
  t.registerBroker({
    id: 'OLD', name: 'Past Broker',
    licenseNumber: '200000', licenseExpiry: '2025-12-01',
  });
  const alerts = t.licenseRenewalAlert(30);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].expired, true);
  assert.ok(alerts[0].daysLeft < 0);
});

test('licenseRenewalAlert with default 30 days works', () => {
  const t = seededTracker();
  const alerts = t.licenseRenewalAlert(); // no arg → default 30
  assert.ok(Array.isArray(alerts));
  assert.ok(alerts.some(a => a.id === 'BRK-02'));
});

// ---------- non-deletion invariants (rule) ----------------------------------

test('no delete* method exists on BrokerFeeTracker (rule: no deletion)', () => {
  const t = new BrokerFeeTracker({ now });
  const proto = Object.getPrototypeOf(t);
  const methods = Object.getOwnPropertyNames(proto);
  for (const m of methods) {
    assert.equal(/^delete/i.test(m), false, `forbidden method: ${m}`);
    assert.equal(/^remove/i.test(m), false, `forbidden method: ${m}`);
  }
});

test('upgrading a broker always keeps the old version accessible via brokerHistory', () => {
  const t = new BrokerFeeTracker({ now });
  t.registerBroker({ id: 'H1', name: 'A', licenseNumber: '101010', licenseExpiry: '2027-01-01' });
  t.registerBroker({ id: 'H1', name: 'B', licenseNumber: '101010', licenseExpiry: '2027-01-01' });
  t.registerBroker({ id: 'H1', name: 'C', licenseNumber: '101010', licenseExpiry: '2027-01-01' });
  assert.equal(t.getBroker('H1').name, 'C');
  assert.equal(t.getBroker('H1').version, 3);
  assert.equal(t.brokerHistory('H1').length, 2);
});

// ---------- module exports --------------------------------------------------

test('module exports enums and constants', () => {
  assert.equal(VAT_RATE, 0.17);
  assert.equal(SALE_CAP_PCT, 0.02);
  assert.equal(RENTAL_CAP_MONTHS, 1);
  assert.equal(TRANSACTION_TYPES.SALE, 'sale');
  assert.equal(EXCLUSIVITY_TYPES.HAFNAYAT_NECHESH, 'hafnayat-nechesh');
  assert.equal(SHOWING_OUTCOMES.SOLD, 'sold');
  assert.equal(CLAIM_STATUSES.DISPUTED, 'disputed');
  assert.equal(DISPUTE_STATUSES.RESOLVED, 'resolved');
});
