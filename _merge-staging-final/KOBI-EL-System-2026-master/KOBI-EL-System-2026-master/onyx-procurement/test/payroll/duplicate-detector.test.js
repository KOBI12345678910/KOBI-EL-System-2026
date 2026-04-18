/**
 * Duplicate Detector — Unit Tests  |  מזהה כפילויות חשבוניות
 * ==============================================================
 *
 * Agent X-02  |  Swarm 3  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:    node --test test/payroll/duplicate-detector.test.js
 *     or:      node --test
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * 40+ test cases exercising:
 *   • Hebrew normalization (niqqud, final letters, whitespace, punct.)
 *   • Zero-dep Levenshtein distance
 *   • All six signals in the duplicate ladder (S1..S6)
 *   • Negative controls (not-duplicate cases)
 *   • Batch grouping & primary-selection rules
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  findDuplicates,
  isDuplicate,
  normalizeHebrew,
  levenshtein,
  _internal,
} = require(path.resolve(__dirname, '..', '..', 'src', 'dedup', 'duplicate-detector.js'));

const {
  parseAmount,
  parseDate,
  dayDiff,
  vendorKey,
  jaccard,
  tokenSet,
} = _internal;

// ─────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────

function makeBill(over) {
  return Object.assign({
    id: 'b-' + Math.random().toString(36).slice(2, 8),
    vendor_name: 'אלקטרו גל בע״מ',
    vendor_id: 'V-100',
    invoice_no: 'INV-2026-0001',
    total: 1234.56,
    date: '2026-03-15',
    description: 'ציוד חשמל לאתר הבנייה',
  }, over || {});
}

// ═════════════════════════════════════════════════════════════
// 1. Hebrew normalization
// ═════════════════════════════════════════════════════════════

test('normalizeHebrew: strips niqqud', () => {
  // אֱלֹהִים → אלהים
  const withNiqqud = '\u05D0\u05B1\u05DC\u05B9\u05D4\u05B4\u05D9\u05DD';
  const got = normalizeHebrew(withNiqqud);
  // Final ם collapses to מ, too
  assert.equal(got, '\u05D0\u05DC\u05D4\u05D9\u05DE');
});

test('normalizeHebrew: maps final letters (ם→מ, ן→נ, ץ→צ, ף→פ, ך→כ)', () => {
  assert.equal(normalizeHebrew('שלום'), '\u05E9\u05DC\u05D5\u05DE');
  assert.equal(normalizeHebrew('כהן'), '\u05DB\u05D4\u05E0');
  assert.equal(normalizeHebrew('קץ'),   '\u05E7\u05E6');
  assert.equal(normalizeHebrew('אלף'), '\u05D0\u05DC\u05E4');
  assert.equal(normalizeHebrew('דרך'), '\u05D3\u05E8\u05DB');
});

test('normalizeHebrew: collapses whitespace (and final-letter normalization)', () => {
  // Note: final ן (U+05DF) is normalized to regular נ (U+05E0) per the final-letter map.
  assert.equal(normalizeHebrew('  אבן   טובה  '), '\u05D0\u05D1\u05E0 \u05D8\u05D5\u05D1\u05D4');
});

test('normalizeHebrew: lowercases Latin letters', () => {
  assert.equal(normalizeHebrew('HELLO World'), 'hello world');
});

test('normalizeHebrew: strips punctuation and Hebrew gershayim', () => {
  const a = normalizeHebrew('אלקטרו גל בע"מ');
  const b = normalizeHebrew('אלקטרו-גל בע״מ');
  assert.equal(a, b, 'punctuation variants must collapse to identical strings');
});

test('normalizeHebrew: null, undefined, empty → empty string', () => {
  assert.equal(normalizeHebrew(null), '');
  assert.equal(normalizeHebrew(undefined), '');
  assert.equal(normalizeHebrew(''), '');
  assert.equal(normalizeHebrew(42), '42');
});

test('normalizeHebrew: strips zero-width and bidi control characters', () => {
  const dirty = 'שלום\u200Eעולם\u200B';
  assert.equal(normalizeHebrew(dirty), '\u05E9\u05DC\u05D5\u05DE\u05E2\u05D5\u05DC\u05DE');
});

// ═════════════════════════════════════════════════════════════
// 2. Levenshtein distance
// ═════════════════════════════════════════════════════════════

test('levenshtein: identical strings → 0', () => {
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('', ''), 0);
});

test('levenshtein: empty vs non-empty → length', () => {
  assert.equal(levenshtein('', 'abcd'), 4);
  assert.equal(levenshtein('abcd', ''), 4);
});

test('levenshtein: classic cases', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3); // k→s, e→i, +g
  assert.equal(levenshtein('flaw', 'lawn'), 2);
  assert.equal(levenshtein('gumbo', 'gambol'), 2);
});

test('levenshtein: Hebrew strings', () => {
  assert.equal(levenshtein('שלום', 'שלומ'), 1);
  assert.equal(levenshtein('כהן', 'לוי'),  3);
});

test('levenshtein: null/undefined inputs treated as empty', () => {
  assert.equal(levenshtein(null, 'abc'), 3);
  assert.equal(levenshtein('abc', undefined), 3);
  assert.equal(levenshtein(null, null), 0);
});

test('levenshtein: symmetry', () => {
  assert.equal(levenshtein('alpha', 'beta'), levenshtein('beta', 'alpha'));
});

// ═════════════════════════════════════════════════════════════
// 3. Utilities
// ═════════════════════════════════════════════════════════════

test('parseAmount: numbers, strings, currency symbols, null', () => {
  assert.equal(parseAmount(100), 100);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('₪  999.00'), 999);
  assert.equal(Number.isNaN(parseAmount(null)), true);
  assert.equal(Number.isNaN(parseAmount('abc')), true);
});

test('parseDate: ISO, Israeli DD/MM/YYYY, Date, epoch', () => {
  const iso = parseDate('2026-03-15');
  const dmy = parseDate('15/03/2026');
  const d   = parseDate(new Date(Date.UTC(2026, 2, 15)));
  assert.equal(iso, dmy);
  assert.equal(iso, d);
});

test('dayDiff: measures absolute day distance', () => {
  const diff = dayDiff('2026-03-15', '2026-03-22');
  assert.equal(diff, 7);
  const reverse = dayDiff('2026-03-22', '2026-03-15');
  assert.equal(reverse, 7);
});

test('vendorKey: uses normalized name, falls back to id', () => {
  assert.equal(vendorKey({ vendor_name: 'ELECTRIC Ltd' }), 'electric ltd');
  assert.equal(vendorKey({ vendor_id: 'V-123' }), '#V-123');
  assert.equal(vendorKey({}), '');
});

test('jaccard + tokenSet: similarity of overlapping token bags', () => {
  const a = tokenSet('ציוד חשמל לאתר הבנייה הגדול');
  const b = tokenSet('ציוד חשמל לאתר הבנייה הקטן');
  const sim = jaccard(a, b);
  assert.ok(sim > 0.6 && sim < 1, 'expected high but <1 similarity, got ' + sim);
});

// ═════════════════════════════════════════════════════════════
// 4. Signal S1 — exact match
// ═════════════════════════════════════════════════════════════

test('S1: exact vendor + invoice_no + total → confidence 1.0', () => {
  const a = makeBill();
  const b = makeBill({ id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.equal(r.duplicate, true);
  assert.equal(r.confidence, 1.0);
  assert.ok(r.signals.some((s) => s.code === 'S1_EXACT'));
});

test('S1: invoice-number whitespace/case differences still match', () => {
  const a = makeBill({ invoice_no: 'INV-2026-0001' });
  const b = makeBill({ invoice_no: ' inv 2026 0001 ', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.equal(r.duplicate, true);
  assert.equal(r.confidence, 1.0);
});

// ═════════════════════════════════════════════════════════════
// 5. Signal S2 — same vendor + same total within 7 days
// ═════════════════════════════════════════════════════════════

test('S2: same vendor + same total, 5 days apart → 0.90', () => {
  const a = makeBill({ invoice_no: 'A-1', date: '2026-03-10' });
  const b = makeBill({ invoice_no: 'A-2', date: '2026-03-15', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.equal(r.duplicate, true);
  assert.equal(r.confidence, 0.90);
  assert.ok(r.signals.some((s) => s.code === 'S2_VENDOR_TOTAL_7D'));
});

test('S2: 8 days apart → S2 does NOT fire', () => {
  const a = makeBill({ invoice_no: 'A-1', date: '2026-03-01' });
  const b = makeBill({ invoice_no: 'A-2', date: '2026-03-10', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(!r.signals.some((s) => s.code === 'S2_VENDOR_TOTAL_7D'));
});

// ═════════════════════════════════════════════════════════════
// 6. Signal S3 — same vendor + near-total (±1%) within 14 days
// ═════════════════════════════════════════════════════════════

test('S3: same vendor + 0.5% total delta, 10 days apart → 0.75', () => {
  const a = makeBill({ invoice_no: 'A-1', total: 1000.00, date: '2026-03-01' });
  const b = makeBill({ invoice_no: 'A-2', total: 1005.00, date: '2026-03-11', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.equal(r.duplicate, true);
  assert.equal(r.confidence, 0.75);
  assert.ok(r.signals.some((s) => s.code === 'S3_VENDOR_NEAR_TOTAL_14D'));
});

test('S3: same vendor + 2% total delta → does NOT fire', () => {
  const a = makeBill({ invoice_no: 'A-1', total: 1000.00, date: '2026-03-01' });
  const b = makeBill({ invoice_no: 'A-2', total: 1020.00, date: '2026-03-05', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(!r.signals.some((s) => s.code === 'S3_VENDOR_NEAR_TOTAL_14D'));
});

// ═════════════════════════════════════════════════════════════
// 7. Signal S4 — similar vendor name + exact total + 7 days
// ═════════════════════════════════════════════════════════════

test('S4: vendors differ by 1 char + exact total within 7 days → 0.80', () => {
  const a = makeBill({ vendor_name: 'Electra',  vendor_id: 'V-A', invoice_no: 'X1', date: '2026-04-01' });
  const b = makeBill({ vendor_name: 'Electro', vendor_id: 'V-B', invoice_no: 'X2', date: '2026-04-06', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.equal(r.duplicate, true);
  assert.ok(r.confidence >= 0.80);
  assert.ok(r.signals.some((s) => s.code === 'S4_SIMILAR_VENDOR_EXACT_TOTAL'));
});

test('S4: vendors differ by 5 chars → does NOT fire', () => {
  const a = makeBill({ vendor_name: 'AlphaCorp', vendor_id: 'V-A', invoice_no: 'X1' });
  const b = makeBill({ vendor_name: 'Bravopopo', vendor_id: 'V-B', invoice_no: 'X2', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(!r.signals.some((s) => s.code === 'S4_SIMILAR_VENDOR_EXACT_TOTAL'));
});

// ═════════════════════════════════════════════════════════════
// 8. Signal S5 — similar description + same amount
// ═════════════════════════════════════════════════════════════

test('S5: Jaccard ≥ 0.6 + same amount → 0.60', () => {
  const a = makeBill({
    vendor_name: 'Vendor-A', vendor_id: 'V-A',
    invoice_no: 'D1', date: '2026-01-01',
    description: 'שירותי תחזוקה חודשיים אתר ראשי מרץ',
  });
  const b = makeBill({
    vendor_name: 'Vendor-B', vendor_id: 'V-B',
    invoice_no: 'D2', date: '2026-05-20',
    description: 'שירותי תחזוקה חודשיים אתר ראשי אפריל',
    id: 'b-2',
  });
  const r = isDuplicate(a, b);
  assert.ok(r.signals.some((s) => s.code === 'S5_SIMILAR_DESC_SAME_AMOUNT'));
});

test('S5: unrelated descriptions → does NOT fire', () => {
  const a = makeBill({
    vendor_name: 'Vendor-A', vendor_id: 'V-A',
    invoice_no: 'D1', description: 'ציוד חשמל',
  });
  const b = makeBill({
    vendor_name: 'Vendor-B', vendor_id: 'V-B',
    invoice_no: 'D2', description: 'שירותי ניקיון משרד',
    id: 'b-2',
  });
  const r = isDuplicate(a, b);
  assert.ok(!r.signals.some((s) => s.code === 'S5_SIMILAR_DESC_SAME_AMOUNT'));
});

// ═════════════════════════════════════════════════════════════
// 9. Signal S6 — check / reference reuse
// ═════════════════════════════════════════════════════════════

test('S6: same vendor + reused check_no → flag signal', () => {
  const a = makeBill({ invoice_no: 'A-1', check_no: '998877', total: 500 });
  const b = makeBill({ invoice_no: 'A-2', check_no: '998877', total: 800, id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(r.signals.some((s) => s.code === 'S6_REFERENCE_REUSE' && s.flag === true));
});

test('S6: different vendors + same check_no → does NOT fire', () => {
  const a = makeBill({ vendor_id: 'V-A', vendor_name: 'Alpha', check_no: '998877' });
  const b = makeBill({ vendor_id: 'V-B', vendor_name: 'Bravo', check_no: '998877', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(!r.signals.some((s) => s.code === 'S6_REFERENCE_REUSE'));
});

// ═════════════════════════════════════════════════════════════
// 10. Negative controls
// ═════════════════════════════════════════════════════════════

test('negative: totally unrelated bills → not duplicate', () => {
  const a = makeBill({
    vendor_name: 'Alpha',     vendor_id: 'V-A',
    invoice_no: 'A-1',        total: 100,
    date: '2026-01-01',       description: 'office chairs',
  });
  const b = makeBill({
    vendor_name: 'Zeta',      vendor_id: 'V-Z',
    invoice_no: 'Z-999',      total: 9999,
    date: '2026-07-15',       description: 'heavy machinery',
    id: 'b-2',
  });
  const r = isDuplicate(a, b);
  assert.equal(r.duplicate, false);
  assert.equal(r.confidence, 0);
  assert.deepEqual(r.signals, []);
});

test('negative: non-object inputs → not duplicate', () => {
  assert.equal(isDuplicate(null, {}).duplicate, false);
  assert.equal(isDuplicate({}, undefined).duplicate, false);
});

test('same object reference → always duplicate with confidence 1', () => {
  const a = makeBill();
  const r = isDuplicate(a, a);
  assert.equal(r.duplicate, true);
  assert.equal(r.confidence, 1);
});

// ═════════════════════════════════════════════════════════════
// 11. Batch findDuplicates
// ═════════════════════════════════════════════════════════════

test('findDuplicates: returns [] for empty / single-item inputs', () => {
  assert.deepEqual(findDuplicates([]), []);
  assert.deepEqual(findDuplicates([makeBill()]), []);
  assert.deepEqual(findDuplicates(null), []);
});

test('findDuplicates: simple pair grouping', () => {
  const a = makeBill({ id: 'a' });
  const b = makeBill({ id: 'b' });
  const c = makeBill({
    id: 'c',
    vendor_name: 'Totally Different',
    vendor_id: 'V-X',
    invoice_no: 'X-1',
    total: 7777,
    date: '2026-12-01',
    description: 'unrelated',
  });
  const groups = findDuplicates([a, b, c]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].candidates.length, 1);
  assert.equal(groups[0].combined_confidence, 1.0);
  // The primary should be one of the two duplicates (not the unrelated `c`)
  assert.ok(groups[0].primary === a || groups[0].primary === b);
});

test('findDuplicates: transitive grouping (a≈b, b≈c → one group of 3)', () => {
  const a = makeBill({ id: 'a', invoice_no: 'Z-1', date: '2026-03-01', total: 1000 });
  const b = makeBill({ id: 'b', invoice_no: 'Z-2', date: '2026-03-04', total: 1000 });
  const c = makeBill({ id: 'c', invoice_no: 'Z-3', date: '2026-03-07', total: 1000 });
  const groups = findDuplicates([a, b, c]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].candidates.length, 2);
});

test('findDuplicates: primary is earliest-dated bill in the group', () => {
  const early = makeBill({ id: 'early', date: '2026-01-05', invoice_no: 'Q-1' });
  const mid   = makeBill({ id: 'mid',   date: '2026-01-08', invoice_no: 'Q-2' });
  const late  = makeBill({ id: 'late',  date: '2026-01-10', invoice_no: 'Q-3' });
  // Shuffle on purpose
  const groups = findDuplicates([late, mid, early]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].primary.id, 'early');
});

test('findDuplicates: output sorted by confidence descending', () => {
  // Group A: exact (1.0)
  const a1 = makeBill({ id: 'a1', vendor_id: 'V-1', vendor_name: 'Alpha', invoice_no: 'A-1', total: 500, date: '2026-02-01' });
  const a2 = makeBill({ id: 'a2', vendor_id: 'V-1', vendor_name: 'Alpha', invoice_no: 'A-1', total: 500, date: '2026-02-01' });
  // Group B: same vendor + same total, 3 days apart (0.90)
  const b1 = makeBill({ id: 'b1', vendor_id: 'V-2', vendor_name: 'Bravo', invoice_no: 'B-1', total: 800, date: '2026-02-10' });
  const b2 = makeBill({ id: 'b2', vendor_id: 'V-2', vendor_name: 'Bravo', invoice_no: 'B-2', total: 800, date: '2026-02-13' });

  const groups = findDuplicates([b1, b2, a1, a2]);
  assert.equal(groups.length, 2);
  assert.ok(groups[0].combined_confidence >= groups[1].combined_confidence);
  assert.equal(groups[0].combined_confidence, 1.0);
  assert.equal(groups[1].combined_confidence, 0.90);
});

test('findDuplicates: handles large-ish batch without crashing', () => {
  const bills = [];
  for (let i = 0; i < 80; i++) {
    bills.push(makeBill({
      id: 'bulk-' + i,
      vendor_id: 'V-' + (i % 10),
      vendor_name: 'Vendor ' + (i % 10),
      invoice_no: 'IV-' + i,
      total: 100 + i, // all different
      date: '2026-06-01',
      description: 'unique desc ' + i,
    }));
  }
  // None of these should collide
  const groups = findDuplicates(bills);
  assert.equal(groups.length, 0);
});

// ═════════════════════════════════════════════════════════════
// 12. Real-world mixed scenarios
// ═════════════════════════════════════════════════════════════

test('real-world: OCR misread vendor (Hebrew) + identical total → caught by S4', () => {
  const a = makeBill({
    id: 'ocr-a',
    vendor_name: 'אלקטרו גל בעמ',
    vendor_id: 'V-A',
    invoice_no: 'OCR-1',
    total: 2500,
    date: '2026-05-01',
  });
  const b = makeBill({
    id: 'ocr-b',
    vendor_name: 'אלקטרו בל בעמ', // one-letter OCR confusion ג↔ב
    vendor_id: 'V-B',
    invoice_no: 'OCR-2',
    total: 2500,
    date: '2026-05-04',
  });
  const r = isDuplicate(a, b);
  assert.ok(r.duplicate, 'should be flagged as duplicate');
  assert.ok(r.signals.some((s) => s.code === 'S4_SIMILAR_VENDOR_EXACT_TOTAL'));
});

test('real-world: bilingual labels present on every signal', () => {
  const a = makeBill();
  const b = makeBill({ id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(r.signals.length > 0);
  for (const s of r.signals) {
    assert.equal(typeof s.label_en, 'string');
    assert.equal(typeof s.label_he, 'string');
    assert.ok(s.label_en.length > 0);
    assert.ok(s.label_he.length > 0);
  }
});

test('real-world: inputs are not mutated by the detector', () => {
  const a = makeBill();
  const b = makeBill({ id: 'b-2' });
  const snapA = JSON.stringify(a);
  const snapB = JSON.stringify(b);
  isDuplicate(a, b);
  findDuplicates([a, b]);
  assert.equal(JSON.stringify(a), snapA);
  assert.equal(JSON.stringify(b), snapB);
});

test('real-world: Israeli DD/MM/YYYY date format understood', () => {
  const a = makeBill({ invoice_no: 'DT-1', date: '10/03/2026' });
  const b = makeBill({ invoice_no: 'DT-2', date: '12/03/2026', id: 'b-2' });
  const r = isDuplicate(a, b);
  assert.ok(r.duplicate);
  assert.ok(r.signals.some((s) => s.code === 'S2_VENDOR_TOTAL_7D'));
});
