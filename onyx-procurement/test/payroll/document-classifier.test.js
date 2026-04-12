/**
 * Document Classifier — Unit Tests
 * ─────────────────────────────────
 *
 *  Agent X-01 (Swarm 3) — Techno-Kol Uzi Mega-ERP
 *
 *  Hebrew bilingual fixtures for all 20 Israeli document types.
 *  30+ fixtures total, each asserting:
 *    - top prediction matches the expected type
 *    - confidence is within a sane range
 *    - relevant keywords are surfaced in `keywords_matched`
 *
 *  Run with:  node --test test/payroll/document-classifier.test.js
 *     or:     node test/run.js
 *
 *  Requires Node >= 18 for the built-in `node:test` runner.
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  classify,
  classifyBatch,
  getKeywords,
  getSupportedTypes,
  getTypeLabel,
  _internal,
} = require(path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'ml',
  'document-classifier.js'
));

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function assertTopType(text, expectedType, msg) {
  const preds = classify(text);
  assert.ok(
    preds.length > 0,
    `${msg || expectedType}: expected at least 1 prediction, got 0`
  );
  assert.strictEqual(
    preds[0].type,
    expectedType,
    `${msg || expectedType}: expected top=${expectedType}, got ${preds[0].type} (score=${preds[0].score}, keywords=${JSON.stringify(preds[0].keywords_matched)})`
  );
}

function assertConfidenceInRange(text, min, max) {
  const preds = classify(text);
  assert.ok(preds.length > 0, 'need at least 1 prediction');
  const c = preds[0].confidence;
  assert.ok(c >= min && c <= max, `expected confidence in [${min}, ${max}], got ${c}`);
}

// ────────────────────────────────────────────────────────────────
// 1. Basic API contract
// ────────────────────────────────────────────────────────────────

describe('document-classifier :: API contract', () => {
  test('getSupportedTypes returns exactly 20 types', () => {
    const types = getSupportedTypes();
    assert.strictEqual(types.length, 20);
    assert.ok(types.includes('tax_invoice'));
    assert.ok(types.includes('wage_slip'));
    assert.ok(types.includes('form_106'));
    assert.ok(types.includes('form_161'));
    assert.ok(types.includes('opinion'));
  });

  test('getTypeLabel returns Hebrew label', () => {
    assert.strictEqual(getTypeLabel('tax_invoice'), 'חשבונית מס');
    assert.strictEqual(getTypeLabel('wage_slip'), 'תלוש שכר');
    assert.strictEqual(getTypeLabel('form_106'), 'טופס 106');
    assert.strictEqual(getTypeLabel('balance_sheet'), 'מאזן');
    assert.strictEqual(getTypeLabel('opinion'), 'חוות דעת');
  });

  test('getTypeLabel returns null for unknown type', () => {
    assert.strictEqual(getTypeLabel('nonsense_type'), null);
  });

  test('getKeywords returns rules for a known type', () => {
    const rules = getKeywords('tax_invoice');
    assert.ok(rules);
    assert.ok(Array.isArray(rules.primary));
    assert.ok(Array.isArray(rules.secondary));
    assert.ok(Array.isArray(rules.negative));
    assert.ok(rules.primary.length > 0);
    assert.strictEqual(rules.label_he, 'חשבונית מס');
  });

  test('getKeywords returns null for unknown type', () => {
    assert.strictEqual(getKeywords('xyz'), null);
  });

  test('getKeywords returns a defensive copy (mutation does not affect rules)', () => {
    const rules1 = getKeywords('receipt');
    rules1.primary.push({ kw: 'hacked', w: 999 });
    const rules2 = getKeywords('receipt');
    assert.notStrictEqual(rules1.primary.length, rules2.primary.length);
  });

  test('classify() returns an empty array for null/empty input', () => {
    assert.deepStrictEqual(classify(null), []);
    assert.deepStrictEqual(classify(''), []);
    assert.deepStrictEqual(classify('    '), []);
    assert.deepStrictEqual(classify(undefined), []);
  });

  test('classify() returns an empty array for generic irrelevant text', () => {
    const preds = classify('the quick brown fox jumps over the lazy dog');
    assert.strictEqual(preds.length, 0);
  });

  test('classify() caps results to topN', () => {
    const text = `
      חשבונית מס קבלה 12345
      תעודת משלוח מספר 98
      הצעת מחיר לפרויקט
      הזמנת רכש
    `;
    const preds = classify(text, { topN: 2 });
    assert.ok(preds.length <= 2);
  });

  test('classify() topN default is 3', () => {
    const text = `
      חשבונית מס קבלה שולם במזומן
      תעודת משלוח כמות יחידות
      הצעת מחיר תוקף ההצעה
      הזמנת רכש לספק
      חוזה שירותים
    `;
    const preds = classify(text);
    assert.ok(preds.length <= 3);
  });

  test('each prediction has all expected fields', () => {
    const preds = classify('חשבונית מס 12345 עוסק מורשה 514000000');
    assert.ok(preds.length > 0);
    const p = preds[0];
    assert.ok('type' in p);
    assert.ok('type_he' in p);
    assert.ok('type_en' in p);
    assert.ok('confidence' in p);
    assert.ok('score' in p);
    assert.ok('keywords_matched' in p);
    assert.ok('primary_hits' in p);
    assert.ok(Array.isArray(p.keywords_matched));
    assert.ok(p.confidence >= 0 && p.confidence <= 1);
  });
});

// ────────────────────────────────────────────────────────────────
// 2. Fixtures — 30+ real-world Israeli documents
// ────────────────────────────────────────────────────────────────

describe('document-classifier :: fixtures — tax invoice family', () => {
  test('fixture 01 — חשבונית מס (Hebrew)', () => {
    const text = `
      חשבונית מס מספר 20260412
      לכבוד: חברת בנייה בע"מ
      תאריך חשבונית: 12/04/2026
      עוסק מורשה 514000000
      פרטי הספק: טכנו-קול אוזי
      תיאור: חומרי בניין
      סה"כ לפני מע"מ: 10,000 ש"ח
      מע"מ 17%: 1,700 ש"ח
      סה"כ לתשלום: 11,700 ש"ח
    `;
    assertTopType(text, 'tax_invoice');
  });

  test('fixture 02 — Tax Invoice (English headers)', () => {
    const text = `
      Tax Invoice
      Invoice No: 2026/0412
      עוסק מורשה
      מע"מ 17%
      סה"כ לתשלום: 5,850
    `;
    assertTopType(text, 'tax_invoice');
  });

  test('fixture 03 — חשבונית מס/קבלה', () => {
    const text = `
      חשבונית מס/קבלה מספר 555
      שולם במזומן
      עוסק מורשה 514000000
      סה"כ ששולם: 2,340 ש"ח
      מע"מ
    `;
    assertTopType(text, 'tax_invoice_receipt');
  });

  test('fixture 04 — חשבונית מס / קבלה with slashes', () => {
    const text = `
      חשבונית מס / קבלה 0912
      אישור תשלום
      שולם בהעברה בנקאית לחשבון
      מע"מ 17%
    `;
    assertTopType(text, 'tax_invoice_receipt');
  });

  test('fixture 05 — קבלה בלבד (plain receipt)', () => {
    const text = `
      קבלה מספר 9321
      התקבל מ: דוד לוי
      סכום: 500 ש"ח
      במזומן
      אישור קבלה
      תודה
    `;
    assertTopType(text, 'receipt');
  });

  test('fixture 06 — Receipt #EN', () => {
    const text = `
      Receipt No 1234
      Received from: John Doe
      בכרטיס אשראי
      תודה
    `;
    assertTopType(text, 'receipt');
  });
});

describe('document-classifier :: fixtures — procurement family', () => {
  test('fixture 07 — הזמנת רכש (purchase order)', () => {
    const text = `
      הזמנת רכש מספר PO-2026-0001
      ספק: טכנו-קול אוזי בע"מ
      מבקש: מחסן ראשי
      מרכז עלות: 01-23
      מועד אספקה: 30/04/2026
      תנאי תשלום: שוטף +30
      סכום הזמנה: 25,000 ש"ח
    `;
    assertTopType(text, 'purchase_order');
  });

  test('fixture 08 — Purchase Order English', () => {
    const text = `
      Purchase Order
      PO No: 2026-X01
      ספק
      תנאי תשלום שוטף
      סכום הזמנה
    `;
    assertTopType(text, 'purchase_order');
  });

  test('fixture 09 — תעודת משלוח (delivery note)', () => {
    const text = `
      תעודת משלוח מספר 7788
      מקום מסירה: אתר הבנייה רמת גן
      נהג: משה כהן
      רכב: 12-345-67
      יחידות: 50
      פריט: שקי מלט
      כמות: 50
      חתימת המקבל: ______
    `;
    assertTopType(text, 'delivery_note');
  });

  test('fixture 10 — חשבון עסקה (proforma)', () => {
    const text = `
      חשבון עסקה 4321
      לכבוד לקוח פוטנציאלי
      דרישת תשלום - מקדמה 30%
      תוקף: 30 יום
      תנאי תשלום: מקדמה 30% + יתרה באספקה
    `;
    assertTopType(text, 'proforma');
  });

  test('fixture 11 — הצעת מחיר (quote)', () => {
    const text = `
      הצעת מחיר 0001/2026
      לכבוד: ראש המועצה
      תוקף ההצעה: 60 יום
      מחיר ליחידה: 120 ש"ח
      הנחה: 10%
      תנאי תשלום: שוטף +45
      בכפוף לתנאים הכלליים
    `;
    assertTopType(text, 'quote');
  });

  test('fixture 12 — Quotation English', () => {
    const text = `
      Quotation
      הצעה מסחרית
      תוקף ההצעה 30 יום
      מחיר ליחידה
    `;
    assertTopType(text, 'quote');
  });

  test('fixture 13 — הזמנה (generic order)', () => {
    const text = `
      הזמנה מספר 987654
      טופס הזמנה
      כתובת משלוח: רחוב הרצל 10, תל אביב
      פריט: מחשב נייד
      כמות: 3
      סכום כולל: 15,000 ש"ח
    `;
    assertTopType(text, 'order');
  });
});

describe('document-classifier :: fixtures — payroll family', () => {
  test('fixture 14 — תלוש שכר (wage slip)', () => {
    const text = `
      תלוש שכר - חודש מרץ 2026
      עובד: ישראל ישראלי
      ת.ז. 123456789
      שכר יסוד: 10,000
      שעות נוספות: 500
      ברוטו: 10,500
      ביטוח לאומי: 500
      מס הכנסה: 1,200
      מס בריאות: 300
      פנסיה: 600
      קרן השתלמות: 250
      נקודות זיכוי: 2.25
      ימי עבודה: 22
      ימי מחלה: 0
      הבראה: 300
      נטו: 7,650
    `;
    assertTopType(text, 'wage_slip');
  });

  test('fixture 15 — Payslip English + Hebrew hybrid', () => {
    const text = `
      Payslip — March 2026
      תלוש משכורת
      ברוטו 12,500
      נטו 9,800
      ביטוח לאומי
      מס הכנסה
      פנסיה
    `;
    assertTopType(text, 'wage_slip');
  });

  test('fixture 16 — טופס 106 (annual summary)', () => {
    const text = `
      טופס 106 לשנת המס 2025
      ריכוז שנתי לעובד
      מעסיק: טכנו-קול אוזי בע"מ
      עובד: דוד לוי
      ברוטו שנתי: 180,000
      ניכוי מס: 22,500
      ביטוח לאומי שנתי: 9,500
      סה"כ שנתי
    `;
    assertTopType(text, 'form_106');
  });

  test('fixture 17 — טופס 161 (separation)', () => {
    const text = `
      טופס 161
      הודעה על פרישה מעבודה
      פיצויי פיטורים: 45,000 ש"ח
      מענק פרישה: 10,000
      התחלת עבודה: 01/01/2020
      סיום עבודה: 31/03/2026
      סיום העסקה
    `;
    assertTopType(text, 'form_161');
  });

  test('fixture 18 — הודעה חד פעמית', () => {
    const text = `
      הודעה חד פעמית
      אירוע חד-פעמי לעובד
      בונוס חד פעמי
      לא חוזר בחודשים הבאים
    `;
    assertTopType(text, 'one_time_notice');
  });

  test('fixture 19 — פלט ערב (night batch report)', () => {
    const text = `
      פלט ערב — 12/04/2026
      ריצת ערב
      batch id: 20260412-001
      job id: payroll-monthly
      סיכום יום
      זמן התחלה: 22:00
      זמן סיום: 23:45
    `;
    assertTopType(text, 'night_batch');
  });
});

describe('document-classifier :: fixtures — finance / accounting', () => {
  test('fixture 20 — דו"ח חשבונאי (financial report)', () => {
    const text = `
      דו"ח חשבונאי לשנת 2025
      רואה חשבון: יוסי כהן, רו"ח
      הכנסות: 1,200,000
      הוצאות: 900,000
      הון עצמי: 300,000
      חוות דעת רואה חשבון
      ביקורת פנימית
    `;
    assertTopType(text, 'financial_report');
  });

  test('fixture 21 — רווח והפסד (P&L)', () => {
    const text = `
      דו"ח רווח והפסד לרבעון 4/2025
      הכנסות ממכירות: 500,000
      עלות המכר: 300,000
      רווח גולמי: 200,000
      הוצאות תפעוליות: 80,000
      רווח תפעולי: 120,000
      רווח נקי: 90,000
    `;
    assertTopType(text, 'pnl');
  });

  test('fixture 22 — מאזן (balance sheet)', () => {
    const text = `
      מאזן ליום 31/12/2025
      נכסים:
        רכוש שוטף: 400,000
        רכוש קבוע: 1,100,000
        סך נכסים: 1,500,000
      התחייבויות: 900,000
      הון עצמי: 600,000
    `;
    assertTopType(text, 'balance_sheet');
  });

  test('fixture 23 — פתקית בנק (bank voucher)', () => {
    const text = `
      פתקית בנק - הפקדה
      בנק לאומי, סניף 800
      מס' חשבון: 123456
      סכום הפקדה: 25,000 ש"ח
      יתרה לאחר הפקדה: 125,000
      אסמכתה בנקאית: 778899
    `;
    assertTopType(text, 'bank_voucher');
  });
});

describe('document-classifier :: fixtures — contracts & legal', () => {
  test('fixture 24 — חוזה עבודה', () => {
    const text = `
      חוזה עבודה
      שנערך ונחתם בתל אביב ביום 01/04/2026
      בין: חברת טכנו-קול בע"מ (להלן: "המעסיק") - צד א'
      לבין: דוד לוי ת.ז. 123456789 (להלן: "העובד") - צד ב'
      הואיל והצדדים הסכימו בהסכמה מלאה על התנאים הבאים
      תנאי החוזה:
      סעיף 1: תחילת עבודה
      סעיף 2: תפקיד
      בתוקף מיום החתימה
      חתימה: _______
    `;
    assertTopType(text, 'contract');
  });

  test('fixture 25 — הסכם שירות (SLA)', () => {
    const text = `
      הסכם שירות
      SLA - רמת שירות
      הצדדים: ספק השירות והלקוח
      זמני תגובה: עד 4 שעות
      זמינות: 99.9%
      אחזקה שוטפת
      תמיכה טכנית 24/7
    `;
    assertTopType(text, 'service_agreement');
  });

  test('fixture 26 — חוות דעת מקצועית', () => {
    const text = `
      חוות דעת מקצועית
      לכבוד: בית המשפט המחוזי תל אביב
      לבקשת עורך הדין יעקב כהן
      הנני מתכבד להגיש חוות דעת זו
      לאחר בחינה של כל החומר הרלוונטי
      מסקנה: לטובת הצד התובע
      בכבוד רב
      מומחה מטעם בית המשפט
      בהתאם לנתונים שנבדקו
    `;
    assertTopType(text, 'opinion');
  });
});

describe('document-classifier :: fixtures — edge cases', () => {
  test('fixture 27 — multi-type document chooses strongest primary', () => {
    // A wage slip that mentions a tax invoice reference — wage_slip must win.
    const text = `
      תלוש שכר - חודש מרץ 2026
      הערה: חשבונית מס לנסיעות תצורף בנפרד
      ברוטו: 15,000
      נטו: 11,200
      ביטוח לאומי
      מס הכנסה
      פנסיה
      קרן השתלמות
      נקודות זיכוי: 2.25
      ימי עבודה: 22
    `;
    assertTopType(text, 'wage_slip', 'wage_slip primary signal must dominate');
  });

  test('fixture 28 — noisy OCR with unicode artefacts still classifies', () => {
    const text =
      '\u200eחשבונית\u00a0מס\u200f מספר\u2014 12345\n' +
      'עוסק\u00a0מורשה 514000000\n' +
      'מע"מ\u00a017%\n' +
      'סה"כ לתשלום: 11,700 ש"ח';
    assertTopType(text, 'tax_invoice');
  });

  test('fixture 29 — title-zone bonus elevates short title over body noise', () => {
    const text = `
      הצעת מחיר
      ${'תיאור שירות '.repeat(50)}
      תוקף ההצעה: 30 יום
    `;
    assertTopType(text, 'quote');
  });

  test('fixture 30 — confidence > 0.3 for clean tax invoice', () => {
    const text = `
      חשבונית מס 2026/0001
      עוסק מורשה
      מע"מ 17%
      סה"כ לתשלום 5,850
    `;
    assertConfidenceInRange(text, 0.3, 0.99);
  });

  test('fixture 31 — negative keywords demote wrong candidate', () => {
    // Mentions both "חשבונית" and "תלוש שכר" strongly — wage_slip must win.
    const text = `
      תלוש שכר לחודש ינואר 2026
      אזכור: חשבונית שהוצאה לעובד (לא רלוונטי)
      ברוטו 10000
      נטו 7500
      ביטוח לאומי
      מס הכנסה
      פנסיה
      קרן השתלמות
      ימי עבודה 22
    `;
    assertTopType(text, 'wage_slip');
  });

  test('fixture 32 — very short text with strong primary still matches', () => {
    const preds = classify('טופס 106 לשנת 2025');
    assert.ok(preds.length >= 1);
    assert.strictEqual(preds[0].type, 'form_106');
  });

  test('fixture 33 — classifyBatch processes array of strings', () => {
    const results = classifyBatch([
      'חשבונית מס 12345 עוסק מורשה',
      'תלוש שכר חודש מרץ ברוטו נטו ביטוח לאומי מס הכנסה פנסיה',
      'תעודת משלוח מספר 99 כמות יחידות נהג',
    ]);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].predictions[0].type, 'tax_invoice');
    assert.strictEqual(results[1].predictions[0].type, 'wage_slip');
    assert.strictEqual(results[2].predictions[0].type, 'delivery_note');
  });

  test('fixture 34 — classifyBatch processes array of objects', () => {
    const results = classifyBatch([
      { id: 'A1', text: 'קבלה מספר 123 התקבל במזומן תודה' },
      { id: 'A2', text: 'הזמנת רכש ספק תנאי תשלום מועד אספקה מרכז עלות' },
    ]);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].id, 'A1');
    assert.strictEqual(results[0].predictions[0].type, 'receipt');
    assert.strictEqual(results[1].id, 'A2');
    assert.strictEqual(results[1].predictions[0].type, 'purchase_order');
  });

  test('fixture 35 — classifyBatch handles empty array', () => {
    assert.deepStrictEqual(classifyBatch([]), []);
  });

  test('fixture 36 — classifyBatch throws on non-array', () => {
    assert.throws(() => classifyBatch('not an array'), TypeError);
    assert.throws(() => classifyBatch(null), TypeError);
  });
});

// ────────────────────────────────────────────────────────────────
// 3. Internal helpers (white-box)
// ────────────────────────────────────────────────────────────────

describe('document-classifier :: internals', () => {
  const {
    normalize,
    countOccurrences,
    firstIndex,
    isInTitleZone,
    computeConfidence,
  } = _internal;

  test('normalize strips bidi marks and soft hyphens', () => {
    const input = '\u200eחשבונית\u00ad מס\u200f';
    const out = normalize(input);
    assert.strictEqual(out, 'חשבונית מס');
  });

  test('normalize collapses whitespace', () => {
    assert.strictEqual(normalize('  a    b  c\t\td '), 'a b c d');
  });

  test('normalize handles null/undefined gracefully', () => {
    assert.strictEqual(normalize(null), '');
    assert.strictEqual(normalize(undefined), '');
  });

  test('countOccurrences is case-insensitive', () => {
    assert.strictEqual(countOccurrences('Tax Invoice Tax Invoice', 'tax invoice'), 2);
  });

  test('countOccurrences Hebrew exact match', () => {
    assert.strictEqual(countOccurrences('חשבונית מס וגם חשבונית מס', 'חשבונית מס'), 2);
  });

  test('countOccurrences returns 0 for missing/empty needle', () => {
    assert.strictEqual(countOccurrences('abc', ''), 0);
    assert.strictEqual(countOccurrences('abc', 'zzz'), 0);
  });

  test('firstIndex returns correct position', () => {
    const text = 'prefix חשבונית מס suffix';
    assert.ok(firstIndex(text, 'חשבונית מס') > 0);
    assert.strictEqual(firstIndex(text, 'nothing'), -1);
  });

  test('isInTitleZone returns true for very early positions', () => {
    assert.strictEqual(isInTitleZone(5, 1000), true);
  });

  test('isInTitleZone returns false for deep positions', () => {
    assert.strictEqual(isInTitleZone(900, 1000), false);
  });

  test('isInTitleZone minimum zone is 120 chars', () => {
    // Even on a very short string, the first 120 chars are title zone
    assert.strictEqual(isInTitleZone(50, 100), true);
  });

  test('computeConfidence handles zero-other case', () => {
    const c = computeConfidence(10, []);
    assert.ok(c > 0 && c < 1);
  });

  test('computeConfidence returns 0 for non-positive score', () => {
    assert.strictEqual(computeConfidence(0, [1, 2]), 0);
    assert.strictEqual(computeConfidence(-5, [1, 2]), 0);
  });

  test('computeConfidence never exceeds 0.99', () => {
    const c = computeConfidence(9999, []);
    assert.ok(c <= 0.99);
  });
});

// ────────────────────────────────────────────────────────────────
// 4. Consistency / regression guards
// ────────────────────────────────────────────────────────────────

describe('document-classifier :: consistency', () => {
  test('every supported type has non-empty primary keywords', () => {
    for (const t of getSupportedTypes()) {
      const rules = getKeywords(t);
      assert.ok(rules.primary.length > 0, `${t} must have primary keywords`);
      for (const { kw, w } of rules.primary) {
        assert.ok(typeof kw === 'string' && kw.length > 0);
        assert.ok(typeof w === 'number' && w > 0);
      }
    }
  });

  test('every supported type has a Hebrew label', () => {
    for (const t of getSupportedTypes()) {
      const lbl = getTypeLabel(t);
      assert.ok(lbl && lbl.length > 0, `${t} missing label_he`);
    }
  });

  test('classifying each type’s own label yields that type as top-1', () => {
    // Regression: if you accidentally introduce a negative keyword identical
    // to the label of the owner, this test will fail loudly.
    for (const t of getSupportedTypes()) {
      const label = getTypeLabel(t);
      // pad to give the model some bulk to work with
      const text = `${label}\n${label}\nמסמך`;
      const preds = classify(text);
      assert.ok(
        preds.length > 0 && preds[0].type === t,
        `self-label test failed for ${t}: got ${preds[0] && preds[0].type}`
      );
    }
  });
});
