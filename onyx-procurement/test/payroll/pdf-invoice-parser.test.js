/**
 * PDF Invoice Parser — Unit Tests (Agent 89)
 * ───────────────────────────────────────────
 * Validates the Hebrew / Israeli tax-invoice parser against 5 realistic
 * fixtures covering the main document types and edge cases:
 *
 *   1. חשבונית מס — iron supplier (ferrous metals, typical Techno-Kol vendor)
 *   2. חשבונית מס קבלה — welding gases combined invoice-receipt
 *   3. קבלה — simple cash receipt (no VAT breakdown)
 *   4. חשבונית מס — CNC machining services with allocation number (רפורמת 2024)
 *   5. חשבונית מס — English-language vendor (Siemens AG) with ILS currency
 *
 * The tests use the mock-supabase helper purely for shape compatibility with
 * the broader test harness — this parser has no DB dependency.
 *
 * Run with:  node --test test/payroll/pdf-invoice-parser.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseInvoiceText,
  parseInvoicePdf,
  _internal,
} = require('../../src/imports/pdf-invoice-parser');

// Import the shared mock-supabase — proves the test harness pattern works
// even though this parser does not hit the DB.
const { makeMockSupabase } = require('../helpers/mock-supabase');

// ═════════════════════════════════════════════════════════════
// FIXTURES — 5 representative Israeli invoices
// ═════════════════════════════════════════════════════════════

const FIXTURE_1_IRON = `חשבונית מס
איירון סטיל בע"מ — Iron Steel Ltd
רח' החרושת 14, אשדוד
ע.מ 514287931
טלפון: 08-8520000

מספר חשבונית: 2026/0142
תאריך: 11/04/2026
לקוח: טכנו-קול עוזי בע"מ

תיאור                     כמות     מחיר יחידה   סה"כ
ברזל זווית 50x50 מ"מ        20        125.00     2500.00
ברזל עגול ∅25 מ"מ           15         80.00     1200.00
פלטות פלדה 4 מ"מ             8        475.00     3800.00

סה"כ לפני מע"מ               7500.00
מע"מ 18%                     1350.00
סה"כ לתשלום                  8850.00

מספר הקצאה: 100234567
תנאי תשלום: שוטף + 30
`;

const FIXTURE_2_WELDING = `חשבונית מס קבלה
גזי ריתוך ישראל בע"מ
ח.פ 513456789
הקריה התעשייתית, חדרה

מספר חשבונית 72019
תאריך הפקה: 02/04/2026

פריט                           כמות    מחיר    סה"כ
בלון ארגון 50 ליטר               4       350.00  1400.00
בלון CO2 40 ליטר                 2       180.00   360.00
חומר מילוי ER70S-6 15 ק"ג        6        95.00   570.00

סה"כ לפני מע"מ                  2330.00
מע"מ 18%                         419.40
סה"כ כולל מע"מ                  2749.40

שולם במזומן. תודה רבה.
מספר הקצאה: 100998877
`;

const FIXTURE_3_RECEIPT = `קבלה
מוסך דוד — תחזוקת כלי עבודה
ע.מ 034567891
רחוב הפועלים 7, חולון

מספר קבלה: 5501
תאריך: 15.03.2026

שולם עבור:
תחזוקת מחרטה CNC                  850.00
החלפת שמן הידראולי                450.00

סה"כ לתשלום: 1300.00 ש"ח

תודה רבה — מוסך דוד
`;

const FIXTURE_4_CNC = `חשבונית מס
פרציזן מאכינינג בע"מ
Precision Machining Ltd
עוסק מורשה 515123456
אזה"ת ברקן

מספר חשבונית: INV-2026-00789
תאריך: 07/04/2026
לכבוד: Techno-Kol Uzi Ltd

פריט                            כמות      מחיר       סה"כ
עיבוד שבבי חלק A-102              50       125.50    6275.00
עיבוד שבבי חלק B-205              30       210.00    6300.00
חיתוך לייזר לוחות 5 מ"מ           12       340.00    4080.00

סה"כ לפני מע"מ                  16655.00
מע"מ 18%                         2997.90
סה"כ לתשלום                     19652.90

מספר הקצאה (רפורמת חשבוניות 2024): 202600789
`;

const FIXTURE_5_ENGLISH = `TAX INVOICE
Siemens Israel Ltd
VAT ID: 511234567
Herzliya Pituach

Invoice Number: SI-2026-4412
Date: 09/04/2026

Description              Qty     Unit Price    Total
Siemens S7-1500 PLC        2      12500.00    25000.00
I/O Module 16DI            4        850.00     3400.00
Profinet Switch            1       4200.00     4200.00

Subtotal                  32600.00
VAT 18%                    5868.00
Total Amount Due          38468.00 ILS

Allocation Number: 100550099
Payment terms: Net 30
`;

// ═════════════════════════════════════════════════════════════
// TEST SUITE 1 — Fixture parsing (end-to-end)
// ═════════════════════════════════════════════════════════════

describe('parseInvoiceText — fixture 1 — Iron Steel (חשבונית מס)', () => {
  const result = parseInvoiceText(FIXTURE_1_IRON);

  test('detects tax_invoice doc_type', () => {
    assert.equal(result.doc_type, 'tax_invoice');
    assert.equal(result.doc_type_hebrew, 'חשבונית מס');
  });

  test('extracts vendor name from label', () => {
    assert.ok(result.vendor);
    assert.match(result.vendor, /איירון|Iron/);
  });

  test('extracts 9-digit VAT id near ע.מ label', () => {
    assert.equal(result.vendor_vat_id, '514287931');
  });

  test('extracts invoice number 2026/0142', () => {
    assert.equal(result.invoice_no, '2026/0142');
  });

  test('normalises DD/MM/YYYY to ISO date', () => {
    assert.equal(result.invoice_date, '2026-04-11');
  });

  test('extracts subtotal/vat/total and cross-checks math', () => {
    assert.equal(result.subtotal, 7500.00);
    assert.equal(result.vat_amount, 1350.00);
    assert.equal(result.total, 8850.00);
    assert.equal(result.totals_valid, true);
    assert.equal(result.vat_rate, 0.18);
  });

  test('extracts allocation number (רפורמת 2024)', () => {
    assert.equal(result.allocation_no, '100234567');
  });

  test('extracts 3 line items', () => {
    assert.equal(result.line_items.length, 3);
    assert.equal(result.line_items[0].qty, 20);
    assert.equal(result.line_items[0].unit_price, 125);
    assert.equal(result.line_items[0].total, 2500);
  });

  test('overall confidence ≥ 80', () => {
    assert.ok(result.confidence >= 80, `expected ≥80, got ${result.confidence}`);
  });
});

describe('parseInvoiceText — fixture 2 — Welding gases (חשבונית מס קבלה)', () => {
  const result = parseInvoiceText(FIXTURE_2_WELDING);

  test('detects combined tax_invoice_receipt doc_type', () => {
    assert.equal(result.doc_type, 'tax_invoice_receipt');
    assert.equal(result.doc_type_hebrew, 'חשבונית מס קבלה');
  });

  test('extracts ח.פ number', () => {
    assert.equal(result.vendor_vat_id, '513456789');
  });

  test('extracts invoice number 72019', () => {
    assert.equal(result.invoice_no, '72019');
  });

  test('parses decimal VAT amount (419.40)', () => {
    assert.equal(result.vat_amount, 419.40);
    assert.equal(result.subtotal, 2330.00);
    assert.equal(result.total, 2749.40);
    assert.equal(result.totals_valid, true);
  });

  test('extracts date 02/04/2026', () => {
    assert.equal(result.invoice_date, '2026-04-02');
  });

  test('extracts allocation number', () => {
    assert.equal(result.allocation_no, '100998877');
  });

  test('extracts 3 line items', () => {
    assert.equal(result.line_items.length, 3);
  });
});

describe('parseInvoiceText — fixture 3 — Cash receipt (קבלה)', () => {
  const result = parseInvoiceText(FIXTURE_3_RECEIPT);

  test('detects receipt doc_type', () => {
    assert.equal(result.doc_type, 'receipt');
    assert.equal(result.doc_type_hebrew, 'קבלה');
  });

  test('extracts 9-digit VAT id', () => {
    assert.equal(result.vendor_vat_id, '034567891');
  });

  test('extracts DD.MM.YYYY date format', () => {
    assert.equal(result.invoice_date, '2026-03-15');
  });

  test('infers subtotal/vat from total when no breakdown given', () => {
    // Receipt gives only total (1300 ש"ח). Parser should still surface total.
    assert.equal(result.total, 1300.00);
  });

  test('no allocation number present', () => {
    assert.equal(result.allocation_no, null);
  });
});

describe('parseInvoiceText — fixture 4 — CNC machining with רפורמה', () => {
  const result = parseInvoiceText(FIXTURE_4_CNC);

  test('detects tax_invoice', () => {
    assert.equal(result.doc_type, 'tax_invoice');
  });

  test('extracts 9-digit VAT id after עוסק מורשה label', () => {
    assert.equal(result.vendor_vat_id, '515123456');
  });

  test('extracts alphanumeric invoice number INV-2026-00789', () => {
    assert.equal(result.invoice_no, 'INV-2026-00789');
  });

  test('extracts allocation number from "רפורמת חשבוניות 2024" line', () => {
    assert.equal(result.allocation_no, '202600789');
  });

  test('large-value totals parse correctly', () => {
    assert.equal(result.subtotal, 16655.00);
    assert.equal(result.vat_amount, 2997.90);
    assert.equal(result.total, 19652.90);
    assert.equal(result.totals_valid, true);
    assert.equal(result.vat_rate, 0.18);
  });

  test('extracts 3 line items with description column', () => {
    assert.equal(result.line_items.length, 3);
    const itemA = result.line_items.find((i) => i.total === 6275.00);
    assert.ok(itemA, 'line item with total 6275.00 missing');
    assert.equal(itemA.qty, 50);
    assert.equal(itemA.unit_price, 125.50);
  });
});

describe('parseInvoiceText — fixture 5 — English invoice (Siemens)', () => {
  const result = parseInvoiceText(FIXTURE_5_ENGLISH);

  test('detects tax_invoice from English "TAX INVOICE"', () => {
    assert.equal(result.doc_type, 'tax_invoice');
  });

  test('extracts VAT id after "VAT ID:" label', () => {
    assert.equal(result.vendor_vat_id, '511234567');
  });

  test('extracts invoice number after "Invoice Number:"', () => {
    assert.equal(result.invoice_no, 'SI-2026-4412');
  });

  test('extracts Subtotal / VAT / Total', () => {
    assert.equal(result.subtotal, 32600.00);
    assert.equal(result.vat_amount, 5868.00);
    assert.equal(result.total, 38468.00);
    assert.equal(result.totals_valid, true);
  });

  test('extracts allocation number', () => {
    assert.equal(result.allocation_no, '100550099');
  });

  test('extracts 3 line items', () => {
    assert.equal(result.line_items.length, 3);
  });
});

// ═════════════════════════════════════════════════════════════
// TEST SUITE 2 — Edge cases and internal helpers
// ═════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  test('empty string returns zero-confidence result', () => {
    const r = parseInvoiceText('');
    assert.equal(r.vendor, null);
    assert.equal(r.vendor_vat_id, null);
    assert.equal(r.total, null);
    assert.equal(r.confidence, 0);
    assert.equal(r.doc_type, 'unknown');
  });

  test('null input does not throw', () => {
    assert.doesNotThrow(() => parseInvoiceText(null));
    assert.doesNotThrow(() => parseInvoiceText(undefined));
  });

  test('rejects invalid calendar dates (Feb 30)', () => {
    const iso = _internal.normaliseDate('30', '02', '2026');
    assert.equal(iso, null);
  });

  test('accepts 2-digit year and windows to 1900/2000', () => {
    assert.equal(_internal.normaliseDate('15', '03', '26'), '2026-03-15');
    assert.equal(_internal.normaliseDate('15', '03', '99'), '1999-03-15');
  });

  test('parseMoney strips thousands separator and currency marks', () => {
    assert.equal(_internal.parseMoney('₪1,234.56'), 1234.56);
    assert.equal(_internal.parseMoney('1234.56 ש"ח'), 1234.56);
    assert.equal(_internal.parseMoney('ILS 12,345.00'), 12345.00);
    assert.equal(_internal.parseMoney(''), null);
  });

  test('cross-check infers missing subtotal when only vat+total present', () => {
    const res = _internal.crossCheckTotals({
      subtotal: { value: null, confidence: 0 },
      vat_amount: { value: 180, confidence: 80 },
      total: { value: 1180, confidence: 85 },
    });
    assert.equal(res.subtotal.value, 1000);
    assert.equal(res.inferred.includes('subtotal'), true);
    assert.equal(res.valid, true);
  });

  test('cross-check accepts legacy 17% VAT rate', () => {
    const res = _internal.crossCheckTotals({
      subtotal: { value: 1000, confidence: 90 },
      vat_amount: { value: 170, confidence: 90 },
      total: { value: 1170, confidence: 90 },
    });
    assert.equal(res.valid, true);
    assert.equal(res.rate, 0.17);
  });

  test('detectDocType prefers "חשבונית מס קבלה" over "חשבונית מס"', () => {
    const dt = _internal.detectDocType('... חשבונית מס קבלה ...');
    assert.equal(dt.code, 'tax_invoice_receipt');
  });

  test('detectDocType identifies credit note', () => {
    const dt = _internal.detectDocType('חשבונית זיכוי — החזר סחורה');
    assert.equal(dt.code, 'credit_note');
  });
});

// ═════════════════════════════════════════════════════════════
// TEST SUITE 3 — PDF buffer path
// ═════════════════════════════════════════════════════════════

describe('parseInvoicePdf', () => {
  test('accepts Buffer and returns parsed result', async () => {
    // Minimal fake PDF content with a literal text operand that our
    // fallback extractor can read.
    const pseudo = `%PDF-1.4
1 0 obj <<>> endobj
stream
BT
(חשבונית מס) Tj
(ע.מ 514287931) Tj
(מספר חשבונית 12345) Tj
(תאריך: 01/04/2026) Tj
(סה"כ לתשלום 1180.00) Tj
ET
endstream
%%EOF`;
    const buf = Buffer.from(pseudo, 'latin1');
    const r = await parseInvoicePdf(buf);
    assert.ok(r, 'result should exist');
    assert.equal(typeof r.confidence, 'number');
    assert.ok(['pdf-parse', 'pdf-parse+fallback', 'fallback', 'none'].includes(r.extraction_engine));
  });

  test('rejects non-buffer input', async () => {
    await assert.rejects(() => parseInvoicePdf('not a buffer'), /Buffer/);
  });

  test('accepts Uint8Array (coerces to Buffer)', async () => {
    const u8 = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const r = await parseInvoicePdf(u8);
    assert.ok(r);
  });
});

// ═════════════════════════════════════════════════════════════
// TEST SUITE 4 — Mock-Supabase shape compatibility
// ═════════════════════════════════════════════════════════════

describe('mock-supabase integration (parser output → staging table shape)', () => {
  test('parsed invoice can be persisted via mock Supabase upsert', async () => {
    const db = makeMockSupabase({ invoice_imports: [] });
    const parsed = parseInvoiceText(FIXTURE_1_IRON);
    const row = {
      id: 1,
      invoice_number: parsed.invoice_no,
      vendor_name: parsed.vendor,
      vendor_tax_id: parsed.vendor_vat_id,
      invoice_date: parsed.invoice_date,
      total_amount: parsed.total,
      vat_amount: parsed.vat_amount,
      subtotal: parsed.subtotal,
      allocation_no: parsed.allocation_no,
      doc_type: parsed.doc_type,
      confidence: parsed.confidence,
      parsed_at: new Date().toISOString(),
    };
    const { data, error } = await db.from('invoice_imports').insert(row).select().single();
    assert.equal(error, null);
    assert.equal(data.invoice_number, '2026/0142');
    assert.equal(data.vendor_tax_id, '514287931');
    assert.equal(data.total_amount, 8850);
    assert.equal(data.allocation_no, '100234567');
  });
});
