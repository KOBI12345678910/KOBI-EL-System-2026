# Invoice PDF Generator — `src/invoices/invoice-pdf-generator.js`

**Agent 71 — 2026-04-11**

Bilingual (Hebrew RTL + English) PDF generator for Israeli tax documents,
fully compliant with **רפורמת חשבונית ישראל 2024** (Israel Invoice Reform 2024).

Built on `pdfkit` + `bwip-js` — both already in the project's dependencies.

---

## Law compliance — רפורמת חשבונית ישראל 2024

The reform, phased in from Jan 2024, mandates that every tax invoice above a
rolling threshold carry a **מספר הקצאה (allocation number)** obtained from
the Israel Tax Authority (ITA) via their real-time API. The threshold is
25,000 ILS pre-VAT in 2024, dropping progressively through 2028 to cover
effectively every B2B invoice.

This generator enforces — or warns on — every data point required by the
reform. The current law reference:

| # | Requirement | Hebrew | Enforcement |
|---|---|---|---|
| 1 | Allocation number | מספר הקצאה מרשות המיסים | **warning** if missing; rendered red on the PDF |
| 2 | QR code with allocation + ח"פ + amount | קוד QR לסריקה | auto-rendered via bwip-js |
| 3 | Seller identity | שם, ח"פ, כתובת, טלפון | `seller` block |
| 4 | Buyer identity | שם, ח"פ | `buyer` block |
| 5 | Sequential invoice number | מספר חשבונית רציף | `invoice_number` |
| 6 | Invoice date + value date | תאריך חשבונית ותאריך ערך | `invoice_date`, `value_date` |
| 7 | Line items | תיאור, כמות, יחידה, מחיר, סכום | `lines` array with description / quantity / unit / unit_price / line_total |
| 8 | Subtotal before VAT | סה"כ לפני מע"מ | `subtotal_net` — derived if omitted |
| 9 | VAT 17% (or other) | מע"מ לפי שיעור | `vat_breakdown.standard_17` |
| 10 | Grand total incl. VAT | סה"כ כולל מע"מ | `gross_total` — derived if omitted |
| 11 | Document type | סוג חשבונית | `doc_type`: `tax_invoice` / `tax_invoice_receipt` / `credit_note` / `proforma` / `receipt` |
| 12 | Payment terms | תנאי תשלום | `payment.method`, `payment.due_date` |
| 13 | Digital signature | חתימה דיגיטלית | `signature` block — or placeholder |
| 14 | VAT tiers: 17% / 0% / exempt | דרגות מע"מ | `vat_breakdown.standard_17` / `zero_0` / `exempt` |
| 15 | Regulatory declaration | הצהרת יישום תקנה | footer, rendered HE + EN |

### Why is the generator forgiving?

It follows the same policy as `src/payroll/pdf-generator.js` — missing
fields are coerced to defaults and a **warnings block** is rendered at
the bottom of the PDF so the document is *obviously* non-compliant when
eyeballed, instead of silently disappearing at the middle of a nightly
batch. The caller is responsible for passing a complete invoice; the
generator will tell you what's wrong, not refuse to run.

For strict mode, call `_internal.complianceWarnings(invoice)` before
rendering and reject if the array is non-empty.

---

## Public API

```js
const {
  generateInvoicePdf,
  generateTaxInvoicePdf,     // חשבונית מס-קבלה alias
  generateCreditNotePdf,     // חשבונית זיכוי alias
  generateReceiptPdf,        // קבלה alias
} = require('./src/invoices/invoice-pdf-generator');
```

All four functions return `Promise<{ path, size }>`.

```js
await generateInvoicePdf(invoice,   '/path/to/invoice.pdf');
await generateTaxInvoicePdf(invoice, '/path/to/tax-invoice-receipt.pdf');
await generateCreditNotePdf(cn,      '/path/to/credit.pdf');
await generateReceiptPdf(rcpt,       '/path/to/receipt.pdf');
```

Each wrapper just presets `doc_type` on a shallow-copied invoice — use
`generateInvoicePdf` directly if you already set `doc_type` yourself.

---

## Invoice shape

```js
{
  doc_type: 'tax_invoice',           // see DOC_TYPES below
  invoice_number: 'INV-2026-000123',
  allocation_number: 'AL202612345678', // מספר הקצאה from ITA
  invoice_date: '2026-04-11',
  value_date:   '2026-04-30',
  currency:     'ILS',                 // 'ILS' | 'USD' | 'EUR'

  seller: {
    legal_name: 'טכנו-קול עוזי בע"מ',
    company_id: '515123456',           // ח"פ
    address:    'רחוב האלקטרוניקה 10, פתח תקווה',
    phone:      '03-555-1234',
    email:      'billing@...',         // optional
    tax_file:   '947123456',           // optional
    public_key: '...',                 // optional, for digital sig
  },

  buyer: {
    legal_name: 'אלקטרה בע"מ',
    company_id: '520098765',           // ח"פ — required above 5k ILS
    address:    'רחוב הרצל 45, תל אביב',
    phone:      '03-777-9999',         // optional
    email:      'ap@...',              // optional
  },

  lines: [
    {
      description: 'לוח בקרה דיגיטלי דגם TK-500',
      quantity:    10,
      unit:        'יח\'',
      unit_price:  1250.00,
      line_total:  12500.00,           // derived if omitted
      vat_rate:    0.17,               // 0.17 | 0 | 0 (+ is_exempt: true)
    },
  ],

  subtotal_net: 16000.00,              // derived if omitted
  vat_breakdown: {                     // derived if omitted
    standard_17: { net: 16000.00, vat: 2720.00 },
    zero_0:      { net: 0,        vat: 0 },
    exempt:      { net: 0,        vat: 0 },
  },
  vat_total:   2720.00,                // derived if omitted
  gross_total: 18720.00,               // derived if omitted

  payment: {
    method:       'bank_transfer',     // see PAYMENT_METHODS below
    due_date:     '2026-05-11',
    bank_account: '12-345-678901',     // optional
  },

  // optional — for digitally-signed invoices
  signature: {
    signed_at:   '2026-04-11T10:00:00Z',
    signer_name: 'קובי אלקיים',
    algorithm:   'RSA-SHA256',
    value:       'MEUCIQDabc...base64...==',
  },

  // for credit notes only
  credit_reason:        'החזרת סחורה פגומה',
  original_invoice_ref: 'INV-2026-000100',
}
```

### Supported `doc_type` values

| Code | Hebrew | English |
|---|---|---|
| `tax_invoice` | חשבונית מס | Tax Invoice |
| `tax_invoice_receipt` | חשבונית מס-קבלה | Tax Invoice / Receipt |
| `credit_note` | חשבונית זיכוי | Credit Note |
| `proforma` | חשבונית עסקה | Proforma Invoice |
| `receipt` | קבלה | Receipt |

### Supported `payment.method` values

`bank_transfer` · `credit_card` · `cash` · `check` · `standing_order`

---

## QR code format

The QR payload is a pipe-delimited string matching the ITA scanner spec:

```
AL|<allocation>|CI|<seller ח"פ>|AMT|<gross>|INV|<invoice #>|DT|<date>
```

Example:

```
AL|AL202612345678|CI|515123456|AMT|18720.00|INV|INV-2026-000123|DT|2026-04-11
```

The QR is generated via `bwip-js` (`bcid: 'qrcode'`) and embedded as a
PNG in the right-hand side of the totals zone on page 1.

---

## Examples

### 1. Standard tax invoice

```js
const { generateInvoicePdf } = require('./src/invoices/invoice-pdf-generator');

const invoice = {
  doc_type: 'tax_invoice',
  invoice_number: 'INV-2026-000123',
  allocation_number: 'AL202612345678',
  invoice_date: '2026-04-11',
  value_date:   '2026-04-30',
  currency:     'ILS',
  seller: {
    legal_name: 'טכנו-קול עוזי בע"מ',
    company_id: '515123456',
    address:    'רחוב האלקטרוניקה 10, פתח תקווה',
    phone:      '03-555-1234',
  },
  buyer: {
    legal_name: 'אלקטרה בע"מ',
    company_id: '520098765',
  },
  lines: [
    { description: 'לוח בקרה דיגיטלי TK-500', quantity: 10, unit: 'יח\'', unit_price: 1250, vat_rate: 0.17 },
    { description: 'התקנה והפעלה',           quantity: 8,  unit: 'שעה', unit_price: 350,  vat_rate: 0.17 },
  ],
  payment: { method: 'bank_transfer', due_date: '2026-05-11' },
};

const { path, size } = await generateInvoicePdf(invoice, '/tmp/invoice-123.pdf');
console.log(`wrote ${size} bytes to ${path}`);
```

> Totals and `vat_breakdown` will be derived automatically if you don't
> supply them — see `normalizeInvoice()`.

### 2. Credit note (חשבונית זיכוי)

```js
const { generateCreditNotePdf } = require('./src/invoices/invoice-pdf-generator');

await generateCreditNotePdf({
  invoice_number: 'CN-2026-000007',
  allocation_number: 'AL202687654321',
  invoice_date: '2026-04-11',
  credit_reason: 'החזרת סחורה פגומה',
  original_invoice_ref: 'INV-2026-000100',
  seller: { legal_name: 'טכנו-קול', company_id: '515123456' },
  buyer:  { legal_name: 'אלקטרה',   company_id: '520098765' },
  lines: [
    { description: 'החזרה — TK-500', quantity: 2, unit: 'יח\'', unit_price: -1250, vat_rate: 0.17 },
  ],
}, '/tmp/credit-007.pdf');
```

### 3. Mixed-rate invoice (17% + 0% export + exempt)

```js
await generateInvoicePdf({
  doc_type: 'tax_invoice',
  invoice_number: 'INV-2026-000200',
  allocation_number: 'AL202600000200',
  invoice_date: '2026-04-11',
  seller: { legal_name: 'טכנו-קול', company_id: '515123456' },
  buyer:  { legal_name: 'Global Corp', company_id: '' },
  lines: [
    { description: 'ייעוץ טכני',     quantity: 10, unit: 'שעה',   unit_price: 500,  vat_rate: 0.17 },
    { description: 'יצוא לחו"ל',    quantity: 1,  unit: 'חבילה', unit_price: 3000, vat_rate: 0 },
    { description: 'שירותי חינוך',  quantity: 1,  unit: 'קורס',  unit_price: 1500, vat_rate: 0, is_exempt: true },
  ],
}, '/tmp/mixed-vat.pdf');
```

### 4. Strict compliance check

```js
const { _internal } = require('./src/invoices/invoice-pdf-generator');

const warnings = _internal.complianceWarnings(invoice);
if (warnings.length > 0) {
  throw new Error('Non-compliant invoice: ' + warnings.join('; '));
}
await generateInvoicePdf(invoice, '/tmp/strict.pdf');
```

### 5. Pre-check QR payload

```js
const payload = _internal.buildQrPayload(invoice);
// 'AL|AL202612345678|CI|515123456|AMT|18720.00|INV|INV-2026-000123|DT|2026-04-11'
```

---

## Testing

```
node --test test/invoice-pdf-generator.test.js
```

- 16 test cases covering all four wrappers, mixed VAT, Hebrew, signed vs
  unsigned, missing allocation number, normalization math, nested output
  dirs, overwriting, and internal helpers.
- Generated PDFs are left in `test/tmp-invoices/` for manual inspection.
  The directory is wiped at the start of every test run.

---

## Fixtures

`test/fixtures/invoices-pdf.js` exports six fixture builders:

| Function | Description |
|---|---|
| `buildTaxInvoice(overrides)` | standard חשבונית מס, 17% VAT, 3 lines |
| `buildTaxInvoiceReceipt(overrides)` | חשבונית מס-קבלה (paid on the spot) |
| `buildCreditNote(overrides)` | חשבונית זיכוי with negative amounts |
| `buildMixedVatInvoice(overrides)` | 17% + 0% export + exempt, three lines |
| `buildSignedInvoice(overrides)` | invoice with `signature` block present |
| `buildMinimalReceipt(overrides)` | bare-minimum קבלה for a cash sale |

All fixtures accept a shallow `overrides` object; seller/buyer/payment
sub-objects are deep-merged so you can override a single field without
losing the rest.

---

## Layout reference

```
┌──────────────────────────────────────────────────────────────┐
│              Tax Invoice / חשבונית מס (centered, 20pt)       │
│           Invoice # / Allocation # / rendered in green       │
├──────────────────────────────────────────────────────────────┤
│  SELLER / מוכר                   BUYER / קונה                │
│  Name, ח"פ, address, phone       Name, ח"פ, address          │
├──────────────────────────────────────────────────────────────┤
│  Invoice date / Value date                                   │
├──────────────────────────────────────────────────────────────┤
│  LINE ITEMS — Desc | Qty | Unit | Price | VAT% | Total       │
│  ...                                                         │
├──────────────────────────────────────────────────────────────┤
│  VAT BREAKDOWN                                               │
│  Standard 17% — Net / VAT                                    │
│  Zero 0%      — Net / VAT                                    │
│  Exempt       — Net / VAT                                    │
├─────────────────────────────────┬────────────────────────────┤
│  Subtotal / VAT total           │                            │
│  ┌───────────────────────────┐  │        [QR CODE]           │
│  │   GRAND TOTAL / סה"כ      │  │    Scan to verify          │
│  └───────────────────────────┘  │                            │
├─────────────────────────────────┴────────────────────────────┤
│  Payment Terms / תנאי תשלום                                  │
├──────────────────────────────────────────────────────────────┤
│  Digital Signature / חתימה דיגיטלית                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  signed_at / signer / algo / value OR [ UNSIGNED ]     │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  רפורמת חשבונית ישראל 2024 — declaration                    │
│  Registered with Israel Tax Authority per 2024 reform        │
└──────────────────────────────────────────────────────────────┘
```

---

## References

- Israel Tax Authority — Invoice Reform 2024 (רפורמת חשבוניות)
- `src/payroll/pdf-generator.js` — layout / formatting conventions this
  generator follows
- `test/fixtures/invoices.js` — DB-shape invoice fixtures (for VAT module)
- `test/fixtures/invoices-pdf.js` — PDF-shape fixtures used here
