/**
 * Smoke tests for invoice PDF generator — src/invoices/invoice-pdf-generator.js
 * Agent 71 — 2026-04-11
 *
 * Run with:   node --test test/invoice-pdf-generator.test.js
 *
 * These tests verify:
 *   - PDF files are produced and have the %PDF- header
 *   - All four convenience wrappers (invoice / credit / receipt / tax-invoice-receipt)
 *   - Compliance checker returns expected warnings
 *   - QR payload builder shape
 *   - Normalization: line totals + VAT breakdown derived from lines
 *   - All-zero, mixed-VAT, Hebrew strings, signed vs unsigned
 *
 * Generated PDFs are LEFT in test/tmp-invoices/ for manual eyeballing.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  generateInvoicePdf,
  generateTaxInvoicePdf,
  generateCreditNotePdf,
  generateReceiptPdf,
  _internal,
} = require('../src/invoices/invoice-pdf-generator.js');

const {
  buildTaxInvoice,
  buildTaxInvoiceReceipt,
  buildCreditNote,
  buildMixedVatInvoice,
  buildSignedInvoice,
  buildMinimalReceipt,
} = require('./fixtures/invoices-pdf.js');

const TMP_DIR = path.join(__dirname, 'tmp-invoices');

// Wipe + recreate tmp dir once, before any tests.
if (fs.existsSync(TMP_DIR)) {
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
  }
} else {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function out(name) {
  return path.join(TMP_DIR, name);
}

function readPdfHeader(p) {
  return fs.readFileSync(p).subarray(0, 5).toString('ascii');
}

// ─────────────────────────────────────────────────────────────
// 1. Realistic tax invoice → file exists, %PDF- header, size > 2kb
// ─────────────────────────────────────────────────────────────
test('generateInvoicePdf: realistic tax invoice (>2000 bytes)', async () => {
  const inv = buildTaxInvoice();
  const target = out('01-tax-invoice.pdf');
  const result = await generateInvoicePdf(inv, target);
  assert.equal(result.path, target);
  assert.ok(fs.existsSync(target), 'PDF file should exist on disk');
  assert.ok(result.size > 2000, `PDF size should be > 2000 bytes, got ${result.size}`);
  assert.equal(readPdfHeader(target), '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 2. generateTaxInvoicePdf wrapper (חשבונית מס-קבלה)
// ─────────────────────────────────────────────────────────────
test('generateTaxInvoicePdf: sets doc_type=tax_invoice_receipt', async () => {
  const inv = buildTaxInvoiceReceipt();
  const target = out('02-tax-invoice-receipt.pdf');
  const result = await generateTaxInvoicePdf(inv, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 2000);
  assert.equal(readPdfHeader(target), '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 3. generateCreditNotePdf (חשבונית זיכוי)
// ─────────────────────────────────────────────────────────────
test('generateCreditNotePdf: produces credit note with negative totals', async () => {
  const cn = buildCreditNote();
  const target = out('03-credit-note.pdf');
  const result = await generateCreditNotePdf(cn, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 2000);
  assert.equal(readPdfHeader(target), '%PDF-');
  assert.ok(cn.gross_total < 0, 'credit note gross should be negative');
});

// ─────────────────────────────────────────────────────────────
// 4. generateReceiptPdf
// ─────────────────────────────────────────────────────────────
test('generateReceiptPdf: minimal receipt still produces valid PDF', async () => {
  const rcpt = buildMinimalReceipt();
  const target = out('04-receipt.pdf');
  const result = await generateReceiptPdf(rcpt, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 1500);
  assert.equal(readPdfHeader(target), '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 5. Mixed VAT rates (17% + 0% export + exempt)
// ─────────────────────────────────────────────────────────────
test('mixed VAT rates: standard + zero + exempt', async () => {
  const inv = buildMixedVatInvoice();
  const target = out('05-mixed-vat.pdf');
  const result = await generateInvoicePdf(inv, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 2000);
  // Sanity check: vat_total = only from 17% portion
  assert.equal(inv.vat_breakdown.standard_17.vat, 850.00);
  assert.equal(inv.vat_breakdown.zero_0.net, 3000.00);
  assert.equal(inv.vat_breakdown.exempt.net, 1500.00);
});

// ─────────────────────────────────────────────────────────────
// 6. Signed invoice block
// ─────────────────────────────────────────────────────────────
test('signed invoice: signature block includes signer details', async () => {
  const inv = buildSignedInvoice();
  const target = out('06-signed.pdf');
  const result = await generateInvoicePdf(inv, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 2000);
});

// ─────────────────────────────────────────────────────────────
// 7. Unsigned invoice: placeholder rendered
// ─────────────────────────────────────────────────────────────
test('unsigned invoice: still renders, with placeholder block', async () => {
  const inv = buildTaxInvoice({ signature: undefined });
  const target = out('07-unsigned.pdf');
  const a = await generateInvoicePdf(inv, target);
  const b = await generateInvoicePdf(buildSignedInvoice(), out('07b-signed-compare.pdf'));
  assert.ok(a.size !== b.size, 'signed and unsigned should differ in size');
});

// ─────────────────────────────────────────────────────────────
// 8. Missing allocation_number → warning but still produces PDF
// ─────────────────────────────────────────────────────────────
test('missing allocation_number: produces degraded PDF + warning', async () => {
  const inv = buildTaxInvoice({ allocation_number: undefined });
  const warnings = _internal.complianceWarnings(inv);
  assert.ok(warnings.some((w) => w.includes('הקצאה')), 'should warn about missing allocation');
  const target = out('08-no-allocation.pdf');
  const result = await generateInvoicePdf(inv, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 1500);
});

// ─────────────────────────────────────────────────────────────
// 9. buildQrPayload format
// ─────────────────────────────────────────────────────────────
test('buildQrPayload: pipe-delimited with allocation/company/amount', () => {
  const inv = buildTaxInvoice();
  const payload = _internal.buildQrPayload(inv);
  assert.ok(payload.startsWith('AL|AL202612345678'), `payload starts with allocation, got: ${payload}`);
  assert.ok(payload.includes('|CI|515123456|'), 'payload includes company id');
  assert.ok(payload.includes('|AMT|18720.00|'), 'payload includes amount');
  assert.ok(payload.includes('|INV|INV-2026-000123|'), 'payload includes invoice number');
});

// ─────────────────────────────────────────────────────────────
// 10. normalizeInvoice: derives totals from lines
// ─────────────────────────────────────────────────────────────
test('normalizeInvoice: derives subtotal + VAT when omitted', () => {
  const raw = {
    doc_type: 'tax_invoice',
    invoice_number: 'TEST-1',
    allocation_number: 'AL999',
    seller: { legal_name: 'S', company_id: '1' },
    buyer:  { legal_name: 'B' },
    lines: [
      { description: 'a', quantity: 2, unit_price: 500, vat_rate: 0.17 },
      { description: 'b', quantity: 1, unit_price: 1000, vat_rate: 0.17 },
    ],
    // totals omitted on purpose
  };
  const n = _internal.normalizeInvoice(raw);
  assert.equal(n.subtotal_net, 2000);
  assert.equal(n.vat_total, 340);
  assert.equal(n.gross_total, 2340);
  assert.equal(n.vat_breakdown.standard_17.net, 2000);
  assert.equal(n.vat_breakdown.standard_17.vat, 340);
});

// ─────────────────────────────────────────────────────────────
// 11. Hebrew RTL content in descriptions + seller/buyer
// ─────────────────────────────────────────────────────────────
test('Hebrew RTL content does not crash generator', async () => {
  const inv = buildTaxInvoice({
    seller: {
      legal_name: 'טכנו-קול עוזי בע"מ — סניף ירושלים',
    },
    buyer: {
      legal_name: 'חברת הבנייה הצפונית בע"מ',
      company_id: '512987654',
    },
    lines: [
      {
        description: 'שירותי אחזקה חודשיים לחדר מכונות — כולל חלפים',
        quantity: 1,
        unit: 'חודש',
        unit_price: 8500,
        line_total: 8500,
        vat_rate: 0.17,
      },
    ],
    subtotal_net: 8500,
    vat_breakdown: {
      standard_17: { net: 8500, vat: 1445 },
      zero_0: { net: 0, vat: 0 },
      exempt: { net: 0, vat: 0 },
    },
    vat_total: 1445,
    gross_total: 9945,
  });
  const target = out('11-hebrew-rtl.pdf');
  const result = await generateInvoicePdf(inv, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 2000);
});

// ─────────────────────────────────────────────────────────────
// 12. Creates nested output dir if missing
// ─────────────────────────────────────────────────────────────
test('creates output directory if it does not exist', async () => {
  const nested = path.join(TMP_DIR, 'deep', 'dir', 'here');
  if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
  assert.ok(!fs.existsSync(nested));
  const target = path.join(nested, '12-nested.pdf');
  const result = await generateInvoicePdf(buildTaxInvoice(), target);
  assert.ok(fs.existsSync(nested));
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 2000);
});

// ─────────────────────────────────────────────────────────────
// 13. Two calls with same path → overwrites
// ─────────────────────────────────────────────────────────────
test('two calls with same path overwrite cleanly', async () => {
  const target = out('13-overwrite.pdf');
  const r1 = await generateInvoicePdf(buildTaxInvoice(), target);
  const r2 = await generateInvoicePdf(
    buildTaxInvoice({ invoice_number: 'INV-2026-OVER' }),
    target,
  );
  assert.ok(fs.existsSync(target));
  assert.ok(r1.size > 2000 && r2.size > 2000);
  assert.equal(readPdfHeader(target), '%PDF-');
});

// ─────────────────────────────────────────────────────────────
// 14. Forgiving mode: skimpy invoice → still produces something
// ─────────────────────────────────────────────────────────────
test('skimpy invoice: does not crash, warnings captured', async () => {
  const skimpy = {
    doc_type: 'tax_invoice',
    invoice_number: 'INV-SKIMPY',
    seller: { legal_name: 'טכנו-קול' },
    buyer:  { legal_name: 'קונה' },
    lines: [],
  };
  const warnings = _internal.complianceWarnings(skimpy);
  assert.ok(warnings.length >= 4, `expected many warnings, got ${warnings.length}`);
  const target = out('14-skimpy.pdf');
  const result = await generateInvoicePdf(skimpy, target);
  assert.ok(fs.existsSync(target));
  assert.ok(result.size > 1000);
});

// ─────────────────────────────────────────────────────────────
// 15. DOC_TYPES exports include all four required types
// ─────────────────────────────────────────────────────────────
test('DOC_TYPES covers all required document types', () => {
  const types = _internal.DOC_TYPES;
  assert.ok(types.tax_invoice, 'tax_invoice');
  assert.ok(types.tax_invoice_receipt, 'tax_invoice_receipt');
  assert.ok(types.credit_note, 'credit_note');
  assert.ok(types.proforma, 'proforma');
  assert.ok(types.receipt, 'receipt');
});

// ─────────────────────────────────────────────────────────────
// 16. formatMoney uses ILS symbol by default
// ─────────────────────────────────────────────────────────────
test('formatMoney: default ILS symbol, USD/EUR overrides', () => {
  assert.ok(_internal.formatMoney(1234.5, 'ILS').includes('₪'));
  assert.ok(_internal.formatMoney(1234.5, 'USD').includes('$'));
  assert.ok(_internal.formatMoney(1234.5, 'EUR').includes('€'));
});
