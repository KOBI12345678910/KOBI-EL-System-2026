/* ============================================================================
 * Techno-Kol ERP — form-857 test suite
 * Agent X-47 / Swarm 3C / Israeli withholding tax (אישור ניכוי במקור)
 * ----------------------------------------------------------------------------
 *  Covers:
 *    1.  getWithholdingRate defaults to 30% for professional
 *    2.  getWithholdingRate returns 5% for transportation, 25% lottery, 20% rent
 *    3.  getWithholdingRate uses valid certificate rate
 *    4.  getWithholdingRate falls back to default when cert expired
 *    5.  getWithholdingRate falls back when cert not-yet-valid
 *    6.  getWithholdingRate ignores cert when service type mismatches
 *    7.  computeWithholding: gross/withheld/net arithmetic is correct
 *    8.  computeWithholding: small-amount exemption flag → 0 withholding
 *    9.  computeWithholding: throws on missing vendor_id
 *   10.  computeWithholding: throws on negative gross
 *   11.  computeWithholding: records rule=CERT_VALID_REDUCED with cert_no
 *   12.  computeWithholding: records rule=CERT_EXPIRED when past valid_to
 *   13.  computeWithholding: records rule=CERT_TYPE_MISMATCH
 *   14.  computeWithholding: rounds to 2 decimal places (banker-safe)
 *   15.  validateCertificate: rejects missing fields
 *   16.  validateCertificate: rejects rate > 0.5
 *   17.  validateCertificate: rejects valid_to before valid_from
 *   18.  validateCertificate: accepts well-formed record
 *   19.  importCertificate: stores and lists back
 *   20.  importCertificate: throws on invalid input
 *   21.  expiringCerts: returns certs expiring within window
 *   22.  expiringCerts: excludes already-expired certificates
 *   23.  expiringCerts: sorted ascending by days_until_expiry
 *   24.  annualReport(year): aggregates multi-vendor totals
 *   25.  annualReport(year, vendor): filters to one vendor
 *   26.  annualReport returns empty skeleton for unknown vendor
 *   27.  exportXmlTaxAuthority: produces BOM + <Report857>
 *   28.  exportXmlTaxAuthority: XML contains recipient ids
 *   29.  tieInto102: sums gross + withheld for given month
 *   30.  tieInto102: counts unique vendors
 *   31.  validateCertificateViaApi: returns valid=true on active cert
 *   32.  validateCertificateViaApi: returns valid=false when no cert
 *   33.  DEFAULT_RATES match Israeli 2026 reference values
 *   34.  SMALL_AMOUNT_THRESHOLD_NIS is set
 *   35.  reset() clears all state
 *
 *  Zero deps — runs via:   node --test test/payroll/form-857.test.js
 * ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const MODULE_PATH = path.resolve(
  __dirname, '..', '..', 'onyx-procurement', 'src', 'tax', 'form-857.js'
);
const form857 = require(MODULE_PATH);
const { SERVICE_TYPES, DEFAULT_RATES, RULES, SMALL_AMOUNT_THRESHOLD_NIS } = form857;

// Fresh engine per test group to keep state isolated.
function fresh() {
  return form857.createEngine();
}

// ─────────────────────────────────────────────────────────────────────
// 1–6 — getWithholdingRate
// ─────────────────────────────────────────────────────────────────────

test('1. getWithholdingRate defaults to 30% for professional', () => {
  const eng = fresh();
  const rate = eng.getWithholdingRate('514111118', SERVICE_TYPES.PROFESSIONAL, '2026-05-01');
  assert.equal(rate, 0.30);
});

test('2. getWithholdingRate returns 5% transportation / 25% lottery / 20% rent', () => {
  const eng = fresh();
  assert.equal(eng.getWithholdingRate('514111118', SERVICE_TYPES.TRANSPORTATION, '2026-05-01'), 0.05);
  assert.equal(eng.getWithholdingRate('514111118', SERVICE_TYPES.LOTTERY,        '2026-05-01'), 0.25);
  assert.equal(eng.getWithholdingRate('514111118', SERVICE_TYPES.RENT,           '2026-05-01'), 0.20);
});

test('3. getWithholdingRate uses a valid certificate rate', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-001',
    rate: 0.05,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const rate = eng.getWithholdingRate('514444442', SERVICE_TYPES.PROFESSIONAL, '2026-06-15');
  assert.equal(rate, 0.05);
});

test('4. getWithholdingRate falls back to default when cert expired', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-001',
    rate: 0.05,
    valid_from: '2025-04-01',
    valid_to:   '2026-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const rate = eng.getWithholdingRate('514444442', SERVICE_TYPES.PROFESSIONAL, '2026-08-01');
  assert.equal(rate, DEFAULT_RATES[SERVICE_TYPES.PROFESSIONAL]);
});

test('5. getWithholdingRate falls back when cert is not yet valid', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-001',
    rate: 0.05,
    valid_from: '2027-04-01',
    valid_to:   '2028-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const rate = eng.getWithholdingRate('514444442', SERVICE_TYPES.PROFESSIONAL, '2026-06-15');
  assert.equal(rate, DEFAULT_RATES[SERVICE_TYPES.PROFESSIONAL]);
});

test('6. getWithholdingRate ignores cert when service type mismatches', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-001',
    rate: 0.05,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.CONSTRUCTION,
  });
  // Payment is PROFESSIONAL — cert (construction) should NOT apply
  const rate = eng.getWithholdingRate('514444442', SERVICE_TYPES.PROFESSIONAL, '2026-06-15');
  assert.equal(rate, DEFAULT_RATES[SERVICE_TYPES.PROFESSIONAL]);
});

// ─────────────────────────────────────────────────────────────────────
// 7–14 — computeWithholding
// ─────────────────────────────────────────────────────────────────────

test('7. computeWithholding: arithmetic correct (gross / withheld / net)', () => {
  const eng = fresh();
  const r = eng.computeWithholding({
    vendor_id: '514111118',
    gross: 10000,
    type: SERVICE_TYPES.PROFESSIONAL,
    date: '2026-05-01',
  });
  assert.equal(r.gross, 10000);
  assert.equal(r.withheld, 3000);  // 30%
  assert.equal(r.net, 7000);
  assert.equal(r.rate, 0.30);
  assert.equal(r.rule, RULES.NO_CERT_DEFAULT);
});

test('8. computeWithholding: small_amount_exempt flag → 0 withholding', () => {
  const eng = fresh();
  const r = eng.computeWithholding({
    vendor_id: '514111118',
    gross: 3000,
    type: SERVICE_TYPES.PROFESSIONAL,
    date: '2026-05-01',
    small_amount_exempt: true,
  });
  assert.equal(r.withheld, 0);
  assert.equal(r.rate, 0);
  assert.equal(r.rule, RULES.SMALL_AMOUNT_EXEMPT);
});

test('9. computeWithholding: throws on missing vendor_id', () => {
  const eng = fresh();
  assert.throws(
    () => eng.computeWithholding({ gross: 100, type: SERVICE_TYPES.OTHER }),
    /vendor_id required/
  );
});

test('10. computeWithholding: throws on negative gross', () => {
  const eng = fresh();
  assert.throws(
    () => eng.computeWithholding({ vendor_id: '514111118', gross: -10, type: SERVICE_TYPES.OTHER }),
    /non-negative/
  );
});

test('11. computeWithholding: rule CERT_VALID_REDUCED + carries cert number', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-XYZ',
    rate: 0.10,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const r = eng.computeWithholding({
    vendor_id: '514444442',
    gross: 10000,
    type: SERVICE_TYPES.PROFESSIONAL,
    date: '2026-05-01',
  });
  assert.equal(r.rule, RULES.CERT_VALID_REDUCED);
  assert.equal(r.certificate_no, 'CRT-XYZ');
  assert.equal(r.withheld, 1000);
});

test('12. computeWithholding: rule CERT_EXPIRED after valid_to', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-EXP',
    rate: 0.05,
    valid_from: '2025-04-01',
    valid_to:   '2026-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const r = eng.computeWithholding({
    vendor_id: '514444442',
    gross: 10000,
    type: SERVICE_TYPES.PROFESSIONAL,
    date: '2026-08-01',
  });
  assert.equal(r.rule, RULES.CERT_EXPIRED);
  assert.equal(r.rate, 0.30);
});

test('13. computeWithholding: rule CERT_TYPE_MISMATCH', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-TRANS',
    rate: 0.02,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.TRANSPORTATION,
  });
  // Payment is PROFESSIONAL
  const r = eng.computeWithholding({
    vendor_id: '514444442',
    gross: 10000,
    type: SERVICE_TYPES.PROFESSIONAL,
    date: '2026-06-01',
  });
  assert.equal(r.rule, RULES.CERT_TYPE_MISMATCH);
  assert.equal(r.rate, 0.30);
});

test('14. computeWithholding: rounds to 2 decimal places', () => {
  const eng = fresh();
  const r = eng.computeWithholding({
    vendor_id: '514111118',
    gross: 1234.567,
    type: SERVICE_TYPES.TRANSPORTATION,
    date: '2026-05-01',
  });
  // 1234.567 * 0.05 = 61.72835 → 61.73
  assert.equal(r.withheld, 61.73);
  assert.equal(r.net, round2(1234.567 - 61.73));
});

function round2(n) { return Math.round(n * 100) / 100; }

// ─────────────────────────────────────────────────────────────────────
// 15–18 — validateCertificate
// ─────────────────────────────────────────────────────────────────────

test('15. validateCertificate: rejects missing fields', () => {
  const eng = fresh();
  const v = eng.validateCertificate({});
  assert.equal(v.valid, false);
  assert.ok(v.errors.length > 0);
});

test('16. validateCertificate: rejects rate > 0.5', () => {
  const eng = fresh();
  const v = eng.validateCertificate({
    vendor_id: '514444442',
    certificate_no: 'CRT-HI',
    rate: 0.75,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => /rate/.test(e)));
});

test('17. validateCertificate: rejects valid_to < valid_from', () => {
  const eng = fresh();
  const v = eng.validateCertificate({
    vendor_id: '514444442',
    certificate_no: 'CRT-B',
    rate: 0.05,
    valid_from: '2027-04-01',
    valid_to:   '2026-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  assert.equal(v.valid, false);
  assert.ok(v.errors.some((e) => /valid_to before/.test(e)));
});

test('18. validateCertificate: accepts a well-formed record', () => {
  const eng = fresh();
  const v = eng.validateCertificate({
    vendor_id: '514444442',
    certificate_no: 'CRT-OK-001',
    rate: 0.05,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  assert.equal(v.valid, true);
  assert.equal(v.errors.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// 19–20 — importCertificate
// ─────────────────────────────────────────────────────────────────────

test('19. importCertificate: stores and lists back', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-R1',
    rate: 0.05,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const listed = eng.listCertificates('514444442');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].certificate_no, 'CRT-R1');
  assert.equal(listed[0].type, SERVICE_TYPES.PROFESSIONAL);
});

test('20. importCertificate: throws on invalid input', () => {
  const eng = fresh();
  assert.throws(
    () => eng.importCertificate('514444442', { certificate_no: 'BAD', rate: 2, type: 'xxx' }),
    /invalid certificate/
  );
});

// ─────────────────────────────────────────────────────────────────────
// 21–23 — expiringCerts
// ─────────────────────────────────────────────────────────────────────

test('21. expiringCerts: returns certs expiring within window', () => {
  const eng = fresh();
  const today = new Date('2026-04-11');
  eng.importCertificate('514444442', {
    vendor_id: '514444442', certificate_no: 'CRT-NEAR', rate: 0.05,
    valid_from: '2025-04-01', valid_to: '2026-05-01',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const out = eng.expiringCerts(60, today);
  assert.equal(out.length, 1);
  assert.equal(out[0].certificate_no, 'CRT-NEAR');
  assert.equal(out[0].days_until_expiry, 20);
});

test('22. expiringCerts: excludes already-expired certificates', () => {
  const eng = fresh();
  const today = new Date('2026-04-11');
  eng.importCertificate('514444442', {
    vendor_id: '514444442', certificate_no: 'CRT-OLD', rate: 0.05,
    valid_from: '2024-04-01', valid_to: '2025-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const out = eng.expiringCerts(365, today);
  assert.equal(out.length, 0);
});

test('23. expiringCerts: sorted ascending by days_until_expiry', () => {
  const eng = fresh();
  const today = new Date('2026-04-11');
  eng.importCertificate('514444442', {
    vendor_id: '514444442', certificate_no: 'CRT-A', rate: 0.05,
    valid_from: '2025-04-01', valid_to: '2026-07-01',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  eng.importCertificate('514111118', {
    vendor_id: '514111118', certificate_no: 'CRT-B', rate: 0.05,
    valid_from: '2025-04-01', valid_to: '2026-05-01',
    type: SERVICE_TYPES.CONSTRUCTION,
  });
  const out = eng.expiringCerts(365, today);
  assert.equal(out.length, 2);
  assert.equal(out[0].certificate_no, 'CRT-B');
  assert.equal(out[1].certificate_no, 'CRT-A');
});

// ─────────────────────────────────────────────────────────────────────
// 24–26 — annualReport
// ─────────────────────────────────────────────────────────────────────

test('24. annualReport(year): aggregates multi-vendor totals', () => {
  const eng = fresh();
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-01-10' });
  eng.recordPayment({ payment_id: 'P2', vendor_id: '514444442', gross: 20000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-06-11' });
  eng.recordPayment({ payment_id: 'P3', vendor_id: '514111118', gross: 7000,  type: SERVICE_TYPES.TRANSPORTATION, date: '2026-03-15' });
  const list = eng.annualReport(2026);
  assert.equal(Array.isArray(list), true);
  assert.equal(list.length, 2);
  const total = list.reduce((s, r) => s + r.total_paid, 0);
  assert.equal(total, 37000);
});

test('25. annualReport(year, vendor): filters to one vendor', () => {
  const eng = fresh();
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-01-10' });
  eng.recordPayment({ payment_id: 'P2', vendor_id: '514444442', gross: 20000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-06-11' });
  eng.recordPayment({ payment_id: 'P3', vendor_id: '514111118', gross: 7000,  type: SERVICE_TYPES.TRANSPORTATION, date: '2026-03-15' });
  const rep = eng.annualReport(2026, '514444442');
  assert.equal(rep.vendor_id, '514444442');
  assert.equal(rep.total_paid, 30000);
  assert.equal(rep.total_withheld, 9000); // 30%
  assert.equal(rep.payment_count, 2);
});

test('26. annualReport returns empty skeleton for unknown vendor', () => {
  const eng = fresh();
  const rep = eng.annualReport(2026, '999999998');
  assert.equal(rep.vendor_id, '999999998');
  assert.equal(rep.total_paid, 0);
  assert.equal(rep.total_withheld, 0);
  assert.equal(rep.payment_count, 0);
});

// ─────────────────────────────────────────────────────────────────────
// 27–28 — exportXmlTaxAuthority
// ─────────────────────────────────────────────────────────────────────

test('27. exportXmlTaxAuthority: produces BOM + <Report857>', () => {
  const eng = fresh();
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-01-10' });
  const xml = eng.exportXmlTaxAuthority(2026, {
    employer: { employerId: '514444442', employerName: 'Techno-Kol Uzi' },
  });
  assert.equal(typeof xml, 'string');
  assert.equal(xml.charCodeAt(0), 0xfeff, 'missing UTF-8 BOM');
  assert.match(xml, /<Report857[^>]*>/);
  assert.match(xml, /<\/Report857>/);
  assert.match(xml, /formCode="857"/);
});

test('28. exportXmlTaxAuthority: XML contains recipient ids', () => {
  const eng = fresh();
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-01-10' });
  eng.recordPayment({ payment_id: 'P2', vendor_id: '514111118', gross: 5000,  type: SERVICE_TYPES.TRANSPORTATION, date: '2026-02-01' });
  const xml = eng.exportXmlTaxAuthority(2026, {
    employer: { employerId: '514444442', employerName: 'Techno-Kol Uzi' },
  });
  assert.match(xml, /514444442/);
  assert.match(xml, /514111118/);
});

// ─────────────────────────────────────────────────────────────────────
// 29–30 — tieInto102
// ─────────────────────────────────────────────────────────────────────

test('29. tieInto102: sums gross + withheld for given month', () => {
  const eng = fresh();
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL,    date: '2026-06-10' });
  eng.recordPayment({ payment_id: 'P2', vendor_id: '514111118', gross:  5000, type: SERVICE_TYPES.TRANSPORTATION,  date: '2026-06-20' });
  eng.recordPayment({ payment_id: 'P3', vendor_id: '514111118', gross:  8000, type: SERVICE_TYPES.TRANSPORTATION,  date: '2026-07-20' });
  const tie = eng.tieInto102(2026, 6);
  assert.equal(tie.year, 2026);
  assert.equal(tie.month, 6);
  assert.equal(tie.total_gross, 15000);
  // 10000 * 0.30 + 5000 * 0.05 = 3000 + 250 = 3250
  assert.equal(tie.total_withheld, 3250);
});

test('30. tieInto102: counts unique vendors', () => {
  const eng = fresh();
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-06-10' });
  eng.recordPayment({ payment_id: 'P2', vendor_id: '514444442', gross: 5000,  type: SERVICE_TYPES.PROFESSIONAL, date: '2026-06-20' });
  eng.recordPayment({ payment_id: 'P3', vendor_id: '514111118', gross: 8000,  type: SERVICE_TYPES.TRANSPORTATION, date: '2026-06-21' });
  const tie = eng.tieInto102(2026, 6);
  assert.equal(tie.contractor_count, 2);
  assert.equal(tie.form_102_row.EmployeesCount, 2);
});

// ─────────────────────────────────────────────────────────────────────
// 31–32 — validateCertificateViaApi (stub)
// ─────────────────────────────────────────────────────────────────────

test('31. validateCertificateViaApi: returns valid=true on active cert', async () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-API',
    rate: 0.05,
    valid_from: '2025-04-01',
    valid_to:   '2028-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  const out = await eng.validateCertificateViaApi('514444442');
  assert.equal(out.valid, true);
  assert.equal(out.certificate_no, 'CRT-API');
});

test('32. validateCertificateViaApi: returns valid=false when no cert', async () => {
  const eng = fresh();
  const out = await eng.validateCertificateViaApi('514111118');
  assert.equal(out.valid, false);
  assert.equal(out.reason, 'no_active_certificate');
});

// ─────────────────────────────────────────────────────────────────────
// 33–35 — constants + reset
// ─────────────────────────────────────────────────────────────────────

test('33. DEFAULT_RATES match Israeli 2026 reference values', () => {
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.PROFESSIONAL], 0.30);
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.TRANSPORTATION], 0.05);
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.LOTTERY], 0.25);
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.RENT], 0.20);
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.DIVIDENDS], 0.25);
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.CONSTRUCTION], 0.05);
  assert.equal(DEFAULT_RATES[SERVICE_TYPES.CONSTRUCTION_SMALL], 0.03);
});

test('34. SMALL_AMOUNT_THRESHOLD_NIS is set', () => {
  assert.equal(typeof SMALL_AMOUNT_THRESHOLD_NIS, 'number');
  assert.ok(SMALL_AMOUNT_THRESHOLD_NIS > 0);
});

test('35. reset() clears all engine state', () => {
  const eng = fresh();
  eng.importCertificate('514444442', {
    vendor_id: '514444442',
    certificate_no: 'CRT-R',
    rate: 0.05,
    valid_from: '2026-04-01',
    valid_to:   '2027-03-31',
    type: SERVICE_TYPES.PROFESSIONAL,
  });
  eng.recordPayment({ payment_id: 'P1', vendor_id: '514444442', gross: 10000, type: SERVICE_TYPES.PROFESSIONAL, date: '2026-06-01' });
  assert.notEqual(eng.stats().certificates, 0);
  assert.notEqual(eng.stats().payments, 0);
  eng.reset();
  const s = eng.stats();
  assert.equal(s.certificates, 0);
  assert.equal(s.payments, 0);
  assert.equal(s.vendors, 0);
});
