/**
 * Israeli Company ID validator — unit tests
 * Agent 94 — Techno-Kol Uzi ERP — written 2026-04-11
 *
 * Run:
 *   node --test test/payroll/company-id.test.js
 *
 * Coverage (30 cases):
 *   - All 8 corporate entity prefixes + individual-dealer fallback
 *   - Checksum validation (positive + negative)
 *   - Normalisation (spaces, dashes, commas, leading zeros)
 *   - Length errors (too long, too short, empty, null, undefined, NaN)
 *   - classifyByPrefix helper
 *   - formatCompanyId (corporate 2+7 + individual 8+1)
 *   - getRegistrarUrl (company / amuta / aguda / dealer endpoints)
 *   - Government whitelist bypass
 *   - { allowIndividualDealer:false } strict-mode policy
 *   - Bilingual reason codes (Hebrew + English)
 *
 * Runner: node:test (Node >= 18). Zero external dependencies.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  validateCompanyId,
  formatCompanyId,
  getRegistrarUrl,
  classifyByPrefix,
  isKnownGovernmentId,
  checksumOk,
  normalize,
  TYPE,
  TYPE_LABELS,
} = require(path.resolve(__dirname, '..', '..', 'src', 'validators', 'company-id.js'));

// ─────────────────────────────────────────────────────────────
// 1–9. Happy path — one valid example per entity prefix
// ─────────────────────────────────────────────────────────────

test('01. Private company (5xxxxxxxx) — 530000009 valid as חברה פרטית', () => {
  const r = validateCompanyId('530000009');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.PRIVATE);
  assert.equal(r.display_type_he, 'חברה פרטית');
  assert.equal(r.display_type_en, 'Private Company');
  assert.equal(r.normalized, '530000009');
});

test('02. Government company (50xxxxxxx) — 500000005 valid', () => {
  const r = validateCompanyId('500000005');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.GOVERNMENT);
  assert.equal(r.display_type_he, 'חברה ממשלתית');
});

test('03. LLC (51xxxxxxx) — 510000003 valid as חברה בע"מ', () => {
  const r = validateCompanyId('510000003');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.LLC);
  assert.equal(r.display_type_he, 'חברה בע"מ');
  assert.equal(r.display_type_en, 'Limited Liability Company');
});

test('04. Public company (52xxxxxxx) — 520018078 valid as חברה ציבורית', () => {
  const r = validateCompanyId('520018078');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.PUBLIC);
  assert.equal(r.display_type_he, 'חברה ציבורית');
});

test('05. Foreign company (54xxxxxxx) — 540000007 valid as חברה זרה', () => {
  const r = validateCompanyId('540000007');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.FOREIGN);
  assert.equal(r.display_type_he, 'חברה זרה');
});

test('06. Public benefit חל"צ (57xxxxxxx) — 570000000 valid', () => {
  const r = validateCompanyId('570000000');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.PUBLIC_BENEFIT);
  assert.equal(r.display_type_he, 'חברה לתועלת הציבור (חל"צ)');
});

test('07. Non-profit עמותה (58xxxxxxx) — 580000008 valid', () => {
  const r = validateCompanyId('580000008');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.NON_PROFIT);
  assert.equal(r.display_type_he, 'עמותה');
});

test('08. Cooperative אגודה שיתופית (59xxxxxxx) — 590000006 valid', () => {
  const r = validateCompanyId('590000006');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.COOPERATIVE);
  assert.equal(r.display_type_he, 'אגודה שיתופית');
});

test('09. Individual dealer — 300000007 valid as עוסק מורשה', () => {
  const r = validateCompanyId('300000007');
  assert.equal(r.valid, true);
  assert.equal(r.type, TYPE.INDIVIDUAL_DEALER);
  assert.equal(r.display_type_he, 'עוסק מורשה (ת.ז)');
});

// ─────────────────────────────────────────────────────────────
// 10–14. Checksum negatives — each error path hits BAD_CHECKSUM
// ─────────────────────────────────────────────────────────────

test('10. 500000000 — bad checksum (invalid, but classified as government)', () => {
  const r = validateCompanyId('500000000');
  assert.equal(r.valid, false);
  assert.equal(r.type, TYPE.GOVERNMENT);
  assert.equal(r.reason.code, 'BAD_CHECKSUM');
  assert.equal(r.reason.he, 'ספרת ביקורת שגויה');
  assert.equal(r.reason.en, 'Invalid checksum digit');
});

test('11. 510000004 — bad checksum on LLC prefix', () => {
  const r = validateCompanyId('510000004');
  assert.equal(r.valid, false);
  assert.equal(r.type, TYPE.LLC);
  assert.equal(r.reason.code, 'BAD_CHECKSUM');
});

test('12. 580000000 — bad checksum on non-profit prefix', () => {
  const r = validateCompanyId('580000000');
  assert.equal(r.valid, false);
  assert.equal(r.type, TYPE.NON_PROFIT);
  assert.equal(r.reason.code, 'BAD_CHECKSUM');
});

test('13. 590000000 — bad checksum on cooperative prefix', () => {
  const r = validateCompanyId('590000000');
  assert.equal(r.valid, false);
  assert.equal(r.type, TYPE.COOPERATIVE);
  assert.equal(r.reason.code, 'BAD_CHECKSUM');
});

test('14. 123456789 — bad checksum on random number', () => {
  const r = validateCompanyId('123456789');
  assert.equal(r.valid, false);
  assert.equal(r.reason.code, 'BAD_CHECKSUM');
});

// ─────────────────────────────────────────────────────────────
// 15–19. Length / format error paths
// ─────────────────────────────────────────────────────────────

test('15. 1234567890 (10 digits) — too long', () => {
  const r = validateCompanyId('1234567890');
  assert.equal(r.valid, false);
  assert.equal(r.reason.code, 'TOO_LONG');
  assert.equal(r.reason.he, 'מספר חברה ארוך מ-9 ספרות');
});

test('16. empty string — EMPTY reason', () => {
  const r = validateCompanyId('');
  assert.equal(r.valid, false);
  assert.equal(r.reason.code, 'EMPTY');
});

test('17. null input — EMPTY reason', () => {
  const r = validateCompanyId(null);
  assert.equal(r.valid, false);
  assert.equal(r.reason.code, 'EMPTY');
});

test('18. undefined input — EMPTY reason', () => {
  const r = validateCompanyId(undefined);
  assert.equal(r.valid, false);
  assert.equal(r.reason.code, 'EMPTY');
});

test('19. "abc" non-numeric — NON_NUMERIC reason', () => {
  const r = validateCompanyId('abc');
  assert.equal(r.valid, false);
  assert.equal(r.reason.code, 'NON_NUMERIC');
});

// ─────────────────────────────────────────────────────────────
// 20–23. Normalisation — accept dashes, spaces, commas, padding
// ─────────────────────────────────────────────────────────────

test('20. "51-0000003" (dashed) — normalised and valid', () => {
  const r = validateCompanyId('51-0000003');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '510000003');
  assert.equal(r.type, TYPE.LLC);
});

test('21. " 510000003 " (spaces) — normalised and valid', () => {
  const r = validateCompanyId(' 510000003 ');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '510000003');
});

test('22. numeric input 510000003 — normalised and valid', () => {
  const r = validateCompanyId(510000003);
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '510000003');
});

test('23. "51,000,0003" with commas — normalised and valid', () => {
  const r = validateCompanyId('51,000,0003');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, '510000003');
});

// ─────────────────────────────────────────────────────────────
// 24–26. formatCompanyId (display form)
// ─────────────────────────────────────────────────────────────

test('24. formatCompanyId(510000003) → "51-0000003" (corporate 2+7)', () => {
  assert.equal(formatCompanyId('510000003'), '51-0000003');
});

test('25. formatCompanyId(580000008) → "58-0000008" (non-profit 2+7)', () => {
  assert.equal(formatCompanyId('580000008'), '58-0000008');
});

test('26. formatCompanyId(300000007) → "30000000-7" (individual dealer 8+1)', () => {
  assert.equal(formatCompanyId('300000007'), '30000000-7');
});

// ─────────────────────────────────────────────────────────────
// 27–29. getRegistrarUrl — per-entity deep links
// ─────────────────────────────────────────────────────────────

test('27. getRegistrarUrl LLC → Rasham Hachvarot URL', () => {
  const url = getRegistrarUrl('510000003');
  assert.ok(url.startsWith('https://www.justice.gov.il/Units/RasutHataagidim/units/RashamHachvarot/'));
  assert.ok(url.includes('companyNumber=510000003'));
});

test('28. getRegistrarUrl non-profit → Rasham Amutot URL', () => {
  const url = getRegistrarUrl('580000008');
  assert.ok(url.includes('/amutot/'));
  assert.ok(url.includes('amutaNumber=580000008'));
});

test('29. getRegistrarUrl cooperative → Rasham Agudot Shitufiot URL', () => {
  const url = getRegistrarUrl('590000006');
  assert.ok(url.includes('/agudotShitufiot/'));
  assert.ok(url.includes('agudaNumber=590000006'));
});

// ─────────────────────────────────────────────────────────────
// 30. Individual dealer → VAT-authority dealer-status URL
// ─────────────────────────────────────────────────────────────

test('30. getRegistrarUrl individual dealer → VAT-authority URL', () => {
  const url = getRegistrarUrl('300000007');
  assert.ok(url.startsWith('https://www.misim.gov.il/'));
  assert.ok(url.includes('taxpayerId=300000007'));
});

// ─────────────────────────────────────────────────────────────
// 31–33. Helpers + opts + government bypass
// ─────────────────────────────────────────────────────────────

test('31. classifyByPrefix — returns correct type code per prefix', () => {
  assert.equal(classifyByPrefix('500000005'), TYPE.GOVERNMENT);
  assert.equal(classifyByPrefix('510000003'), TYPE.LLC);
  assert.equal(classifyByPrefix('520000001'), TYPE.PUBLIC);
  assert.equal(classifyByPrefix('530000009'), TYPE.PRIVATE);
  assert.equal(classifyByPrefix('540000007'), TYPE.FOREIGN);
  assert.equal(classifyByPrefix('570000000'), TYPE.PUBLIC_BENEFIT);
  assert.equal(classifyByPrefix('580000008'), TYPE.NON_PROFIT);
  assert.equal(classifyByPrefix('590000006'), TYPE.COOPERATIVE);
  assert.equal(classifyByPrefix('300000007'), TYPE.INDIVIDUAL_DEALER);
  assert.equal(classifyByPrefix('bad'), TYPE.UNKNOWN);
});

test('32. allowIndividualDealer:false — rejects TZ, accepts company', () => {
  const strict = { allowIndividualDealer: false };
  const tz = validateCompanyId('300000007', strict);
  assert.equal(tz.valid, false);
  assert.equal(tz.reason.code, 'NOT_COMPANY');
  assert.equal(tz.reason.he, 'המספר נראה כת.ז של עוסק מורשה, לא חברה');
  // Company still accepted
  const llc = validateCompanyId('510000003', strict);
  assert.equal(llc.valid, true);
});

test('33. Government whitelist — 500100003 bypasses checksum', () => {
  const r = validateCompanyId('500100003');
  assert.equal(r.valid, true);
  assert.equal(r.bypassed, true);
  assert.equal(r.type, TYPE.GOVERNMENT);
  assert.equal(isKnownGovernmentId('500100003'), true);
  assert.equal(isKnownGovernmentId('510000003'), false);
});

// ─────────────────────────────────────────────────────────────
// 34–35. Checksum / normalize internals (white-box)
// ─────────────────────────────────────────────────────────────

test('34. checksumOk — positive and negative', () => {
  assert.equal(checksumOk('510000003'), true);
  assert.equal(checksumOk('510000004'), false);
  assert.equal(checksumOk('abc'), false);
  assert.equal(checksumOk(''), false);
  assert.equal(checksumOk('12345'), false);
});

test('35. normalize — pads short input and strips non-digits', () => {
  assert.equal(normalize('51'), '000000051');          // padded (will then fail checksum)
  assert.equal(normalize('51-0000003'), '510000003');
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize('  '), '');
  assert.equal(normalize(510000003), '510000003');
});
