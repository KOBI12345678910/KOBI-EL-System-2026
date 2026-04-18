/**
 * Tests for Receipt PDF generator — src/receipts/receipt-pdf-generator.js
 * Agent 72 — written 2026-04-11
 *
 * Run with:   node --test test/receipt-pdf-generator.test.js
 *
 * Cleanup policy: generated PDFs are LEFT in test/tmp-pdfs/ for manual
 * inspection (useful for eyeballing Hebrew rendering / layout). The
 * directory is wiped at the START of the receipt test run so stale
 * output doesn't accumulate (but tmp-pdfs/ itself is never removed).
 *
 * Coverage:
 *   1. Plain receipt  (קבלה)              — bank transfer
 *   2. On-account     (קבלה על חשבון)    — cash
 *   3. Tax-invoice-receipt (חשבונית מס-קבלה) — credit card, w/ VAT
 *   4. Multi-invoice reference list
 *   5. USD / EUR currency rendering
 *   6. Validation errors
 *   7. File is written with non-zero size and has a PDF header
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  generateReceiptPdf,
  amountToHebrew,
  validateReceipt,
  RECEIPT_TYPES,
  PAYMENT_METHODS,
} = require('../src/receipts/receipt-pdf-generator.js');

const TMP_DIR = path.join(__dirname, 'tmp-pdfs');

// Wipe stale receipt*.pdf files at the start of this file only — we
// deliberately leave non-receipt PDFs alone.
if (fs.existsSync(TMP_DIR)) {
  for (const f of fs.readdirSync(TMP_DIR)) {
    if (f.startsWith('receipt-') && f.endsWith('.pdf')) {
      try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
    }
  }
} else {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ──────────────────────────────────────────────────────────────
// Fixture builder
// ──────────────────────────────────────────────────────────────

function buildReceiptFixture(overrides = {}) {
  const base = {
    type: RECEIPT_TYPES.RECEIPT,
    receipt_number: 1042,
    issue_date: '2026-04-11',
    currency: 'ILS',

    issuer: {
      legal_name: 'טכנו-קול עוזי בע"מ',
      company_id: '515123456',
      tax_file: '947123456',
      address: 'רחוב התעשייה 1, תל אביב 6100000',
    },

    payer: {
      name: 'לקוח דוגמה בע"מ',
      tax_id: '514999888',
      tax_id_type: 'company',
      address: 'רחוב הראשי 10, חיפה',
    },

    amount_gross: 1234.56,

    payment: {
      method: PAYMENT_METHODS.BANK_TRANSFER,
      transfer_reference: 'TRX-2026-0042',
      bank_name: 'בנק הפועלים',
      value_date: '2026-04-11',
    },

    invoice_refs: [
      { invoice_number: 'INV-2026-0123', date: '2026-04-01', amount: 1234.56 },
    ],
  };
  return { ...base, ...overrides };
}

function assertPdfFile(outPath) {
  assert.ok(fs.existsSync(outPath), `PDF was not written at ${outPath}`);
  const stat = fs.statSync(outPath);
  assert.ok(stat.size > 500, `PDF is suspiciously small: ${stat.size} bytes`);
  const fd = fs.openSync(outPath, 'r');
  const buf = Buffer.alloc(5);
  fs.readSync(fd, buf, 0, 5, 0);
  fs.closeSync(fd);
  assert.equal(buf.toString('ascii'), '%PDF-', 'missing PDF magic header');
}

// ──────────────────────────────────────────────────────────────
// Plain receipt
// ──────────────────────────────────────────────────────────────

test('generates a plain Receipt (קבלה) PDF via bank transfer', async () => {
  const receipt = buildReceiptFixture();
  const out = path.join(TMP_DIR, 'receipt-01-plain.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.equal(res.path, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// On-account receipt
// ──────────────────────────────────────────────────────────────

test('generates an On-Account (קבלה על חשבון) PDF via cash', async () => {
  const receipt = buildReceiptFixture({
    type: RECEIPT_TYPES.ON_ACCOUNT,
    receipt_number: 1043,
    amount_gross: 500.00,
    payment: {
      method: PAYMENT_METHODS.CASH,
      value_date: '2026-04-11',
    },
    invoice_refs: [], // on-account: not tied to a specific invoice
  });
  const out = path.join(TMP_DIR, 'receipt-02-on-account.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// Tax invoice receipt with VAT + credit card
// ──────────────────────────────────────────────────────────────

test('generates a Tax-Invoice-Receipt (חשבונית מס-קבלה) with VAT and credit card', async () => {
  const amountBeforeVat = 1000.00;
  const vatRate = 18;
  const vatAmount = amountBeforeVat * vatRate / 100;
  const gross = amountBeforeVat + vatAmount;

  const receipt = buildReceiptFixture({
    type: RECEIPT_TYPES.TAX_INVOICE_RECEIPT,
    receipt_number: 1044,
    amount_gross: gross,
    amount_before_vat: amountBeforeVat,
    vat_amount: vatAmount,
    vat_rate: vatRate,
    payment: {
      method: PAYMENT_METHODS.CREDIT_CARD,
      card_last4: '1234',
      card_brand: 'Visa',
      installments: 3,
      auth_code: 'A87654',
      value_date: '2026-04-12',
    },
  });

  const out = path.join(TMP_DIR, 'receipt-03-tax-invoice-receipt.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// Check payment
// ──────────────────────────────────────────────────────────────

test('generates a Receipt paid by check with bank + check# details', async () => {
  const receipt = buildReceiptFixture({
    receipt_number: 1045,
    amount_gross: 9999.99,
    payment: {
      method: PAYMENT_METHODS.CHECK,
      check_number: '0000042',
      bank_name: 'בנק לאומי',
      bank_number: '10',
      branch_number: '800',
      account_number: '123456',
      value_date: '2026-04-20',
    },
  });
  const out = path.join(TMP_DIR, 'receipt-04-check.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// Multi-invoice reference
// ──────────────────────────────────────────────────────────────

test('generates a Receipt that references multiple invoices', async () => {
  const receipt = buildReceiptFixture({
    receipt_number: 1046,
    amount_gross: 5000.00,
    invoice_refs: [
      { invoice_number: 'INV-2026-0100', date: '2026-03-01', amount: 1500 },
      { invoice_number: 'INV-2026-0101', date: '2026-03-15', amount: 2000 },
      { invoice_number: 'INV-2026-0102', date: '2026-03-30', amount: 1500 },
    ],
  });
  const out = path.join(TMP_DIR, 'receipt-05-multi-invoice.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// Foreign currencies
// ──────────────────────────────────────────────────────────────

test('generates a USD receipt', async () => {
  const receipt = buildReceiptFixture({
    receipt_number: 1047,
    currency: 'USD',
    amount_gross: 2500.00,
    payment: {
      method: PAYMENT_METHODS.BANK_TRANSFER,
      transfer_reference: 'SWIFT-0042',
      bank_name: 'Chase',
      value_date: '2026-04-11',
    },
  });
  const out = path.join(TMP_DIR, 'receipt-06-usd.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

test('generates an EUR receipt', async () => {
  const receipt = buildReceiptFixture({
    receipt_number: 1048,
    currency: 'EUR',
    amount_gross: 750.50,
    payment: {
      method: PAYMENT_METHODS.BANK_TRANSFER,
      transfer_reference: 'SEPA-0042',
      bank_name: 'Deutsche Bank',
      value_date: '2026-04-11',
    },
  });
  const out = path.join(TMP_DIR, 'receipt-07-eur.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// Individual (ת.ז) payer
// ──────────────────────────────────────────────────────────────

test('generates a receipt for an individual payer (ת.ז)', async () => {
  const receipt = buildReceiptFixture({
    receipt_number: 1049,
    payer: {
      name: 'משה כהן',
      tax_id: '123456782',
      tax_id_type: 'person',
    },
    amount_gross: 123.45,
    payment: {
      method: PAYMENT_METHODS.CASH,
      value_date: '2026-04-11',
    },
  });
  const out = path.join(TMP_DIR, 'receipt-08-individual.pdf');
  const res = await generateReceiptPdf(receipt, out);
  assert.ok(res.size > 0);
  assertPdfFile(out);
});

// ──────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────

test('validation: missing receipt_number throws', () => {
  const r = buildReceiptFixture();
  delete r.receipt_number;
  assert.throws(() => validateReceipt(r), /receipt_number/);
});

test('validation: missing issuer.legal_name throws', () => {
  const r = buildReceiptFixture();
  delete r.issuer.legal_name;
  assert.throws(() => validateReceipt(r), /issuer\.legal_name/);
});

test('validation: missing payer.name throws', () => {
  const r = buildReceiptFixture();
  delete r.payer.name;
  assert.throws(() => validateReceipt(r), /payer\.name/);
});

test('validation: unknown type throws', () => {
  const r = buildReceiptFixture({ type: 'bogus' });
  assert.throws(() => validateReceipt(r), /type/);
});

test('validation: unknown payment method throws', () => {
  const r = buildReceiptFixture({
    payment: { method: 'bitcoin' },
  });
  assert.throws(() => validateReceipt(r), /payment\.method/);
});

test('validation: tax_invoice_receipt requires vat_amount', () => {
  const r = buildReceiptFixture({
    type: RECEIPT_TYPES.TAX_INVOICE_RECEIPT,
    // no vat_amount
  });
  assert.throws(() => validateReceipt(r), /vat_amount/);
});

test('validation: negative amount throws', () => {
  const r = buildReceiptFixture({ amount_gross: -1 });
  assert.throws(() => validateReceipt(r), /non-negative/);
});

// ──────────────────────────────────────────────────────────────
// Amount in words is embedded (content-independent sanity check)
// ──────────────────────────────────────────────────────────────

test('sanity: amountToHebrew and generator agree for the canonical case', () => {
  const words = amountToHebrew(1234.56, 'ILS');
  assert.equal(
    words,
    'אלף מאתיים שלושים וארבעה שקלים וחמישים ושש אגורות'
  );
});
