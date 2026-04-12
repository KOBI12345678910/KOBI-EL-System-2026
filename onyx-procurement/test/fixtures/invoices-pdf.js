/**
 * Test fixture factory — invoices for invoice-pdf-generator
 * Agent 71 — 2026-04-11
 *
 * Used by test/invoice-pdf-generator.test.js and anyone else who needs
 * a fully-formed Israel-2024-reform-compliant invoice payload.
 *
 * These fixtures are intentionally independent of the DB-shape fixtures
 * in ./invoices.js — the PDF generator uses a richer nested shape that
 * includes seller/buyer/lines/vat_breakdown.
 */

'use strict';

function buildTaxInvoice(overrides = {}) {
  const base = {
    doc_type: 'tax_invoice',
    invoice_number: 'INV-2026-000123',
    allocation_number: 'AL202612345678',
    invoice_date: '2026-04-11',
    value_date: '2026-04-30',
    currency: 'ILS',

    seller: {
      legal_name: 'טכנו-קול עוזי בע"מ',
      company_id: '515123456',
      address: 'רחוב האלקטרוניקה 10, פתח תקווה 4951010',
      phone: '03-555-1234',
      email: 'billing@technokol-uzi.co.il',
      tax_file: '947123456',
    },

    buyer: {
      legal_name: 'אלקטרה בע"מ',
      company_id: '520098765',
      address: 'רחוב הרצל 45, תל אביב 6578301',
      phone: '03-777-9999',
      email: 'ap@electra.co.il',
    },

    lines: [
      {
        description: 'לוח בקרה דיגיטלי דגם TK-500',
        quantity: 10,
        unit: 'יח\'',
        unit_price: 1250.00,
        line_total: 12500.00,
        vat_rate: 0.17,
      },
      {
        description: 'התקנה והפעלה במקום הלקוח',
        quantity: 8,
        unit: 'שעה',
        unit_price: 350.00,
        line_total: 2800.00,
        vat_rate: 0.17,
      },
      {
        description: 'אחריות מורחבת 3 שנים',
        quantity: 1,
        unit: 'חבילה',
        unit_price: 700.00,
        line_total: 700.00,
        vat_rate: 0.17,
      },
    ],

    subtotal_net: 16000.00,
    vat_breakdown: {
      standard_17: { net: 16000.00, vat: 2720.00 },
      zero_0:      { net: 0,        vat: 0 },
      exempt:      { net: 0,        vat: 0 },
    },
    vat_total: 2720.00,
    gross_total: 18720.00,

    payment: {
      method: 'bank_transfer',
      due_date: '2026-05-11',
      bank_account: '12-345-678901',
    },
  };
  return deepMerge(base, overrides);
}

function buildTaxInvoiceReceipt(overrides = {}) {
  return buildTaxInvoice({
    doc_type: 'tax_invoice_receipt',
    invoice_number: 'RCT-2026-000050',
    payment: {
      method: 'credit_card',
      due_date: '2026-04-11',
    },
    ...overrides,
  });
}

function buildCreditNote(overrides = {}) {
  return buildTaxInvoice({
    doc_type: 'credit_note',
    invoice_number: 'CN-2026-000007',
    allocation_number: 'AL202687654321',
    credit_reason: 'החזרת סחורה פגומה',
    original_invoice_ref: 'INV-2026-000100',
    // credit notes have negative amounts by convention in book-keeping
    lines: [
      {
        description: 'החזרה — לוח בקרה דיגיטלי TK-500',
        quantity: 2,
        unit: 'יח\'',
        unit_price: -1250.00,
        line_total: -2500.00,
        vat_rate: 0.17,
      },
    ],
    subtotal_net: -2500.00,
    vat_breakdown: {
      standard_17: { net: -2500.00, vat: -425.00 },
      zero_0:      { net: 0, vat: 0 },
      exempt:      { net: 0, vat: 0 },
    },
    vat_total: -425.00,
    gross_total: -2925.00,
    ...overrides,
  });
}

function buildMixedVatInvoice(overrides = {}) {
  return buildTaxInvoice({
    invoice_number: 'INV-2026-000200',
    lines: [
      {
        description: 'ייעוץ טכני',
        quantity: 10,
        unit: 'שעה',
        unit_price: 500.00,
        line_total: 5000.00,
        vat_rate: 0.17,
      },
      {
        description: 'יצוא — ציוד לחו"ל',
        quantity: 1,
        unit: 'חבילה',
        unit_price: 3000.00,
        line_total: 3000.00,
        vat_rate: 0, // zero-rated export
      },
      {
        description: 'שירותי חינוך',
        quantity: 1,
        unit: 'קורס',
        unit_price: 1500.00,
        line_total: 1500.00,
        vat_rate: 0,
        is_exempt: true, // exempt
      },
    ],
    subtotal_net: 9500.00,
    vat_breakdown: {
      standard_17: { net: 5000.00, vat: 850.00 },
      zero_0:      { net: 3000.00, vat: 0 },
      exempt:      { net: 1500.00, vat: 0 },
    },
    vat_total: 850.00,
    gross_total: 10350.00,
    ...overrides,
  });
}

function buildSignedInvoice(overrides = {}) {
  return buildTaxInvoice({
    invoice_number: 'INV-2026-000999',
    signature: {
      signed_at: '2026-04-11T10:00:00Z',
      signer_name: 'קובי אלקיים',
      algorithm: 'RSA-SHA256',
      value: 'MEUCIQDabc...base64...signature...xyz==',
    },
    seller: {
      legal_name: 'טכנו-קול עוזי בע"מ',
      company_id: '515123456',
      address: 'רחוב האלקטרוניקה 10, פתח תקווה',
      phone: '03-555-1234',
      public_key: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----',
    },
    ...overrides,
  });
}

function buildMinimalReceipt(overrides = {}) {
  return {
    doc_type: 'receipt',
    invoice_number: 'RCT-2026-000001',
    allocation_number: 'AL202600000001',
    invoice_date: '2026-04-11',
    currency: 'ILS',
    seller: {
      legal_name: 'טכנו-קול עוזי בע"מ',
      company_id: '515123456',
      address: 'רחוב האלקטרוניקה 10, פתח תקווה',
      phone: '03-555-1234',
    },
    buyer: {
      legal_name: 'לקוח פרטי',
      company_id: '',
    },
    lines: [
      {
        description: 'מוצר קטן',
        quantity: 1,
        unit: 'יח\'',
        unit_price: 100.00,
        line_total: 100.00,
        vat_rate: 0.17,
      },
    ],
    subtotal_net: 100.00,
    vat_total: 17.00,
    gross_total: 117.00,
    payment: { method: 'cash', due_date: '2026-04-11' },
    ...overrides,
  };
}

// Shallow/deep merge — second level of seller/buyer/payment is overwritten
// if caller passes a whole object, merged if they pass a string key.
function deepMerge(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = { ...base[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

module.exports = {
  buildTaxInvoice,
  buildTaxInvoiceReceipt,
  buildCreditNote,
  buildMixedVatInvoice,
  buildSignedInvoice,
  buildMinimalReceipt,
};
