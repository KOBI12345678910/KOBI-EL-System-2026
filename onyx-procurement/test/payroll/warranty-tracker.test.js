/**
 * Warranty Tracker — Unit Tests
 * Techno-Kol Uzi mega-ERP / Agent X-33 (Swarm 3B)
 *
 * Run with:  node --test test/payroll/warranty-tracker.test.js
 *
 * 25+ test cases covering the whole module: creation, coverage math,
 * Israeli statutory floor, claims lifecycle, RMA linking, vendor
 * reimbursement, failure-rate analytics, lemon-law detection,
 * expiry alerts, and extended-warranty upsell candidates.
 *
 * Uses only the Node built-in test runner — zero external deps.
 */

'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const W = require(path.resolve(
  __dirname, '..', '..', 'src', 'warranty', 'warranty-tracker.js',
));

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const MS_DAY = 24 * 60 * 60 * 1000;

function iso(dateOrOffsetDays) {
  if (typeof dateOrOffsetDays === 'number') {
    return new Date(Date.now() + dateOrOffsetDays * MS_DAY).toISOString().slice(0, 10);
  }
  return new Date(dateOrOffsetDays).toISOString().slice(0, 10);
}

function makeSale(overrides) {
  return Object.assign({
    invoice_id: 'INV-1001',
    sale_date: iso(-10),
    product_id: 'SKU-METAL-001',
    product_class: 'METAL',
    warranty_days: 365,
    serial_no: 'SN-A-001',
    customer_id: 'CUST-100',
    type: 'MANUFACTURER',
    vendor: null,
    terms: { coverage: 'COMPREHENSIVE', notes: 'אחריות יצרן מלאה' },
    cost: 0,
  }, overrides || {});
}

beforeEach(() => {
  W._resetStore();
});

// ─────────────────────────────────────────────────────────────
// 1. Constants / exports
// ─────────────────────────────────────────────────────────────

test('1. module exports expected public API', () => {
  const required = [
    'createWarranty', 'registerEquipment', 'findBySerialNo',
    'findByWarrantyId', 'findByCustomer', 'findByProduct',
    'checkCoverage', 'createClaim', 'updateClaimStatus',
    'getClaim', 'listClaims', 'linkRMA', 'vendorReimbursement',
    'failureRateReport', 'expiringWarranties', 'lemonCheck',
    'upsellCandidates', 'coverageFromTerms', 'minimumLegalDays',
    'legalFloor', 'CLAIM_STATUSES', 'WARRANTY_TYPES',
    'COVERAGE_KINDS', 'PRODUCT_CLASSES',
  ];
  required.forEach((k) => {
    assert.ok(k in W, `missing export: ${k}`);
  });
});

test('2. Israeli statutory minimum days per product class', () => {
  assert.equal(W.minimumLegalDays('METAL'),       365);
  assert.equal(W.minimumLegalDays('APPLIANCE'),   365);
  assert.equal(W.minimumLegalDays('BUILDING'),    3650);
  assert.equal(W.minimumLegalDays('ELECTRONICS'), 365);
  assert.equal(W.minimumLegalDays('CONSUMABLE'),  0);
  assert.equal(W.minimumLegalDays('UNKNOWN'),     365);
});

// ─────────────────────────────────────────────────────────────
// 2. Warranty creation
// ─────────────────────────────────────────────────────────────

test('3. createWarranty auto-creates with requested days when >= legal floor', () => {
  const id = W.createWarranty(makeSale({ warranty_days: 400 }));
  const w = W.findByWarrantyId(id);
  assert.equal(w.days, 400);
  assert.equal(w.statutory_uplift, false);
  assert.equal(w.type, 'MANUFACTURER');
});

test('4. createWarranty enforces 1-year floor on metal goods when given less', () => {
  const id = W.createWarranty(makeSale({ warranty_days: 90, product_class: 'METAL' }));
  const w = W.findByWarrantyId(id);
  assert.equal(w.days, 365);
  assert.equal(w.statutory_uplift, true);
});

test('5. createWarranty enforces 10-year floor on building materials', () => {
  const id = W.createWarranty(makeSale({
    warranty_days: 365,
    product_class: 'BUILDING',
  }));
  const w = W.findByWarrantyId(id);
  assert.equal(w.days, 3650);
  assert.equal(w.statutory_uplift, true);
});

test('6. createWarranty rejects missing product_id or sale_date', () => {
  assert.throws(() => W.createWarranty({}), /product_id/);
  assert.throws(() => W.createWarranty({ product_id: 'X' }), /sale_date/);
});

test('7. createWarranty computes end_date correctly', () => {
  const saleDate = '2026-01-01';
  const id = W.createWarranty(makeSale({
    sale_date: saleDate,
    warranty_days: 365,
    product_class: 'ELECTRONICS',
  }));
  const w = W.findByWarrantyId(id);
  assert.equal(w.start_date, '2026-01-01');
  assert.equal(w.end_date, '2027-01-01');
});

test('8. registerEquipment creates an owned/inbound warranty', () => {
  const id = W.registerEquipment({
    sale_date: iso(-30),
    product_id: 'EQ-LATHE-05',
    product_class: 'METAL',
    vendor: 'DMG MORI',
    warranty_days: 730,
    serial_no: 'SN-LATHE-05',
  });
  const w = W.findByWarrantyId(id);
  assert.equal(w.owned, true);
  assert.equal(w.customer_id, null);
  assert.equal(w.vendor, 'DMG MORI');
});

// ─────────────────────────────────────────────────────────────
// 3. Lookups
// ─────────────────────────────────────────────────────────────

test('9. findBySerialNo returns the warranty for a known serial', () => {
  const id = W.createWarranty(makeSale({ serial_no: 'SN-TEST-9' }));
  const w = W.findBySerialNo('SN-TEST-9');
  assert.ok(w);
  assert.equal(w.id, id);
  assert.equal(W.findBySerialNo('SN-MISSING'), null);
});

test('10. findByCustomer / findByProduct return all associated warranties', () => {
  const id1 = W.createWarranty(makeSale({ customer_id: 'C-A', product_id: 'P-1', serial_no: 'S1' }));
  const id2 = W.createWarranty(makeSale({ customer_id: 'C-A', product_id: 'P-2', serial_no: 'S2' }));
  const id3 = W.createWarranty(makeSale({ customer_id: 'C-B', product_id: 'P-1', serial_no: 'S3' }));
  assert.equal(W.findByCustomer('C-A').length, 2);
  assert.equal(W.findByCustomer('C-B').length, 1);
  assert.equal(W.findByProduct('P-1').length, 2);
  assert.equal(W.findByProduct('P-2').length, 1);
  // Make sure the right IDs are present
  const idsA = W.findByCustomer('C-A').map((w) => w.id).sort();
  assert.deepEqual(idsA, [id1, id2].sort());
  assert.deepEqual(W.findByCustomer('C-B')[0].id, id3);
});

// ─────────────────────────────────────────────────────────────
// 4. Coverage checks
// ─────────────────────────────────────────────────────────────

test('11. checkCoverage returns covered=true for active warranty', () => {
  const id = W.createWarranty(makeSale({
    sale_date: iso(-100),
    warranty_days: 365,
  }));
  const c = W.checkCoverage(id);
  assert.equal(c.covered, true);
  assert.ok(c.days_remaining > 250 && c.days_remaining < 270);
  assert.equal(c.alert, null);
});

test('12. checkCoverage flags 30-day alert when nearing expiry', () => {
  const id = W.createWarranty(makeSale({
    sale_date: iso(-340),
    warranty_days: 365,
  }));
  const c = W.checkCoverage(id);
  assert.equal(c.covered, true);
  assert.equal(c.alert, '30d');
});

test('13. checkCoverage flags 60-day alert window', () => {
  const id = W.createWarranty(makeSale({
    sale_date: iso(-320),
    warranty_days: 365,
  }));
  const c = W.checkCoverage(id);
  assert.equal(c.covered, true);
  assert.equal(c.alert, '60d');
});

test('14. checkCoverage reports EXPIRED for past warranties', () => {
  const id = W.createWarranty(makeSale({
    sale_date: iso(-500),
    warranty_days: 365,
  }));
  const c = W.checkCoverage(id);
  assert.equal(c.covered, false);
  assert.equal(c.alert, 'EXPIRED');
  assert.ok(c.days_remaining < 0);
});

test('15. checkCoverage returns not-found object for bogus id', () => {
  const c = W.checkCoverage('W-NOPE');
  assert.equal(c.covered, false);
  assert.match(c.reason_he, /לא נמצאה/);
});

// ─────────────────────────────────────────────────────────────
// 5. Claims lifecycle
// ─────────────────────────────────────────────────────────────

test('16. createClaim opens a claim under REPORTED', () => {
  const wid = W.createWarranty(makeSale());
  const cid = W.createClaim(wid, {
    description: 'לא נדלק',
    photos: ['photo-ref-1.jpg'],
    reporter: 'uzi@technokol.co.il',
  });
  const c = W.getClaim(cid);
  assert.equal(c.status, 'REPORTED');
  assert.equal(c.warranty_id, wid);
  assert.equal(c.photos.length, 1);
  assert.equal(c.history.length, 1);
});

test('17. updateClaimStatus appends to history and sets resolution', () => {
  const wid = W.createWarranty(makeSale());
  const cid = W.createClaim(wid, { description: 'רעש חריג' });
  W.updateClaimStatus(cid, 'IN_REVIEW');
  W.updateClaimStatus(cid, 'APPROVED', 'אושרה פנייה — החלפת מנוע');
  W.updateClaimStatus(cid, 'REPAIRED', 'הוחלף מנוע');
  const c = W.getClaim(cid);
  assert.equal(c.status, 'REPAIRED');
  assert.equal(c.resolution, 'הוחלף מנוע');
  assert.equal(c.history.length, 4); // REPORTED + 3 updates
});

test('18. updateClaimStatus rejects unknown status', () => {
  const wid = W.createWarranty(makeSale());
  const cid = W.createClaim(wid, { description: 'x' });
  assert.throws(() => W.updateClaimStatus(cid, 'GARBLED'), /unknown claim status/);
});

test('19. createClaim rejects unknown warranty', () => {
  assert.throws(
    () => W.createClaim('W-NONE', { description: 'x' }),
    /warranty not found/,
  );
});

test('20. linkRMA stores RMA reference on the claim', () => {
  const wid = W.createWarranty(makeSale());
  const cid = W.createClaim(wid, { description: 'שבר' });
  const c = W.linkRMA(cid, 'RMA-2026-0042');
  assert.equal(c.rma_id, 'RMA-2026-0042');
  const hist = c.history;
  assert.ok(hist.some((h) => /RMA/.test(h.note_en)));
});

// ─────────────────────────────────────────────────────────────
// 6. Vendor reimbursement
// ─────────────────────────────────────────────────────────────

test('21. vendorReimbursement accumulates amounts and rejects negatives', () => {
  const wid = W.createWarranty(makeSale());
  const cid = W.createClaim(wid, { description: 'rust', cost: 800 });
  W.vendorReimbursement(cid, 500);
  W.vendorReimbursement(cid, 250);
  const c = W.getClaim(cid);
  assert.equal(c.reimbursed, 750);
  assert.throws(() => W.vendorReimbursement(cid, -50), /non-negative/);
});

// ─────────────────────────────────────────────────────────────
// 7. Failure-rate analytics
// ─────────────────────────────────────────────────────────────

test('22. failureRateReport computes counts, MTBF, top failures', () => {
  const w1 = W.createWarranty(makeSale({ serial_no: 'S-A', product_id: 'PROD-Z' }));
  const w2 = W.createWarranty(makeSale({ serial_no: 'S-B', product_id: 'PROD-Z' }));
  const w3 = W.createWarranty(makeSale({ serial_no: 'S-C', product_id: 'PROD-Z' }));

  W.createClaim(w1, { description: 'מנוע שרוף', reported_at: iso(-90), cost: 400 });
  W.createClaim(w1, { description: 'מנוע שרוף', reported_at: iso(-60), cost: 350 });
  W.createClaim(w2, { description: 'רעש חריג',  reported_at: iso(-30), cost: 120 });
  W.createClaim(w3, { description: 'מנוע שרוף', reported_at: iso(-10), cost: 500 });

  const r = W.failureRateReport('PROD-Z');
  assert.equal(r.warranties_count, 3);
  assert.equal(r.claims_count, 4);
  assert.ok(r.claim_rate > 1.3 && r.claim_rate < 1.4);
  assert.ok(r.mtbf_days !== null && r.mtbf_days > 0);
  assert.equal(r.top_failures[0].description, 'מנוע שרוף');
  assert.equal(r.top_failures[0].count, 3);
  assert.equal(r.total_cost, 400 + 350 + 120 + 500);
});

test('23. failureRateReport honours the period window', () => {
  const wid = W.createWarranty(makeSale({ product_id: 'PROD-W' }));
  W.createClaim(wid, { description: 'a', reported_at: iso(-400) });
  W.createClaim(wid, { description: 'b', reported_at: iso(-10) });
  const r = W.failureRateReport('PROD-W', { from: iso(-30), to: iso(1) });
  assert.equal(r.claims_count, 1);
  assert.equal(r.top_failures[0].description, 'b');
});

// ─────────────────────────────────────────────────────────────
// 8. Expiring warranties
// ─────────────────────────────────────────────────────────────

test('24. expiringWarranties returns only items inside the window', () => {
  W.createWarranty(makeSale({ serial_no: 'E-1', sale_date: iso(-360), warranty_days: 365 })); // ~5d left
  W.createWarranty(makeSale({ serial_no: 'E-2', sale_date: iso(-100), warranty_days: 365 })); // ~265d left
  W.createWarranty(makeSale({ serial_no: 'E-3', sale_date: iso(-500), warranty_days: 365 })); // expired
  const list = W.expiringWarranties(60);
  assert.equal(list.length, 1);
  assert.equal(list[0].serial_no, 'E-1');
});

// ─────────────────────────────────────────────────────────────
// 9. Lemon law
// ─────────────────────────────────────────────────────────────

test('25. lemonCheck flags unit after 3 failed repairs on same defect', () => {
  const wid = W.createWarranty(makeSale({ serial_no: 'LEMON-1' }));
  const c1 = W.createClaim(wid, { description: 'מערכת בקרה נופלת' });
  W.updateClaimStatus(c1, 'IN_REPAIR');
  W.updateClaimStatus(c1, 'REPAIRED');
  const c2 = W.createClaim(wid, { description: 'מערכת בקרה נופלת' });
  W.updateClaimStatus(c2, 'IN_REPAIR');
  W.updateClaimStatus(c2, 'REPAIRED');
  const c3 = W.createClaim(wid, { description: 'מערכת בקרה נופלת' });
  W.updateClaimStatus(c3, 'IN_REPAIR');

  const result = W.lemonCheck(wid);
  assert.equal(result.is_lemon, true);
  assert.equal(result.qualifying_failures, 3);
  assert.equal(result.threshold, 3);
});

test('26. lemonCheck does not flag when below threshold', () => {
  const wid = W.createWarranty(makeSale({ serial_no: 'OK-1' }));
  W.createClaim(wid, { description: 'פגם קטן' });
  W.createClaim(wid, { description: 'פגם קטן' });
  const result = W.lemonCheck(wid);
  assert.equal(result.is_lemon, false);
  assert.equal(result.qualifying_failures, 2);
});

// ─────────────────────────────────────────────────────────────
// 10. Upsell candidates
// ─────────────────────────────────────────────────────────────

test('27. upsellCandidates lists MANUFACTURER warranties nearing expiry', () => {
  const near = W.createWarranty(makeSale({
    serial_no: 'UP-1',
    sale_date: iso(-325),
    warranty_days: 365,
    type: 'MANUFACTURER',
  }));
  W.createWarranty(makeSale({
    serial_no: 'UP-2',
    sale_date: iso(-10),
    warranty_days: 365,
    type: 'MANUFACTURER',
  }));
  W.createWarranty(makeSale({
    serial_no: 'UP-3',
    sale_date: iso(-330),
    warranty_days: 365,
    type: 'EXTENDED',
  }));
  const cand = W.upsellCandidates(60);
  const ids = cand.map((c) => c.warranty_id);
  assert.ok(ids.includes(near));
  assert.equal(cand.length, 1);
});

test('28. upsellCandidates skips owned (inbound) equipment', () => {
  W.registerEquipment({
    sale_date: iso(-325),
    warranty_days: 365,
    product_id: 'EQ-55',
    product_class: 'METAL',
    serial_no: 'OWN-1',
  });
  assert.equal(W.upsellCandidates(60).length, 0);
});

// ─────────────────────────────────────────────────────────────
// 11. coverageFromTerms inference
// ─────────────────────────────────────────────────────────────

test('29. coverageFromTerms infers kind from notes', () => {
  assert.equal(
    W.coverageFromTerms('MANUFACTURER', { notes: 'parts only replacement' }),
    'PARTS_ONLY',
  );
  assert.equal(
    W.coverageFromTerms('EXTENDED', { notes: 'עבודה בלבד — אין חלפים' }),
    'LABOR_ONLY',
  );
  assert.equal(
    W.coverageFromTerms('SERVICE', { notes: 'comprehensive' }),
    'COMPREHENSIVE',
  );
  assert.equal(
    W.coverageFromTerms('MANUFACTURER', { coverage: 'PARTS_ONLY' }),
    'PARTS_ONLY',
  );
});

// ─────────────────────────────────────────────────────────────
// 12. Never-delete invariant
// ─────────────────────────────────────────────────────────────

test('30. history is append-only — never deletes earlier entries', () => {
  const wid = W.createWarranty(makeSale());
  const cid = W.createClaim(wid, { description: 'x' });
  const before = W.getClaim(cid).history.length;
  W.updateClaimStatus(cid, 'IN_REVIEW');
  W.updateClaimStatus(cid, 'APPROVED');
  W.updateClaimStatus(cid, 'CLOSED');
  const after = W.getClaim(cid).history;
  assert.ok(after.length > before);
  // earliest entry still there
  assert.equal(after[0].status, 'REPORTED');
});
