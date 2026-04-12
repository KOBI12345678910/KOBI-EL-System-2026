# Receipt PDF Generator — `src/receipts/receipt-pdf-generator.js`

**Agent 72 — 2026-04-11**

Hebrew-first (with English labels) A4 PDF generator for Israeli receipts,
built on `pdfkit` which is already in the project's dependencies.

Three flavours, one generator:

1. **קבלה** (`receipt`) — ordinary receipt against a tax invoice.
2. **קבלה על חשבון** (`on_account`) — partial payment on customer balance,
   not tied to a specific invoice.
3. **חשבונית מס-קבלה** (`tax_invoice_receipt`) — combined tax invoice +
   receipt. A single legal document that both invoices and records payment.

---

## Law compliance — הוראות ניהול פנקסי חשבונות

The generator is designed around the data points that Israeli Income Tax
law (תקנות מס הכנסה — ניהול פנקסי חשבונות, הוראה 18) requires on every
receipt:

| # | Requirement | Hebrew | Field |
|---|---|---|---|
| 1  | Sequential receipt number | מספר קבלה רציף | `receipt_number` |
| 2  | Issue date | תאריך הוצאה | `issue_date` |
| 3  | Issuer legal name | שם המוציא | `issuer.legal_name` |
| 4  | Issuer company ID / ח.פ | ח.פ / מס' חברה | `issuer.company_id` |
| 5  | Issuer tax file (ניכויים) | תיק ניכויים | `issuer.tax_file` |
| 6  | Payer full name | שם המשלם | `payer.name` |
| 7  | Payer tax ID / ת.ז or ח.פ | ת.ז / ח.פ של המשלם | `payer.tax_id` |
| 8  | Gross amount in figures | סכום בספרות | `amount_gross` |
| 9  | Gross amount in Hebrew words | סכום במילים | **derived via `amountToHebrew`** |
| 10 | Payment method | אמצעי תשלום | `payment.method` |
| 11 | Method-specific details | פרטי האמצעי | `payment.*` (see below) |
| 12 | Value date | תאריך ערך | `payment.value_date` |
| 13 | VAT (for tax_invoice_receipt) | מע"מ | `vat_amount`, `vat_rate`, `amount_before_vat` |
| 14 | Invoice references | הפניה לחשבוניות | `invoice_refs[]` |
| 15 | "מקור" / "העתק" stamps | חותמת מקור / העתק | auto-rendered (layout) |

The generator is forgiving: optional fields are silently omitted, but the
required fields above throw a clear validation error via `validateReceipt`
before the PDF is started — so you never end up with half a file.

---

## Layout — A4 horizontally split

```
┌─────────────────────────────────────┐
│                                     │
│   UPPER HALF  —  מקור (ORIGINAL)   │   ← merchant copy
│                                     │
├ ─ ─ ─ ─ ─ ✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
│                                     │
│   LOWER HALF  —  העתק  (COPY)      │   ← customer copy
│                                     │
└─────────────────────────────────────┘
```

Each half is fully self-contained: receipt number, date, issuer, payer,
amount in figures + words, payment method details, invoice references,
signature line, and a "מקור / ORIGINAL" or "העתק / COPY" stamp in the
top-right corner. A dashed cut-line with the Hebrew note "גזור כאן / cut
here" runs through the page centre.

This is the convention used by most Israeli bookkeeping software and is
what an auditor expects to see if the merchant gives a paper receipt to
a walk-in customer.

---

## Public API

```js
const {
  generateReceiptPdf,
  amountToHebrew,
  RECEIPT_TYPES,
  PAYMENT_METHODS,
  CURRENCIES,
} = require('./src/receipts/receipt-pdf-generator.js');
```

### `generateReceiptPdf(receipt, outputPath) -> Promise<{path, size}>`

Writes a new PDF file at `outputPath`. Creates parent directories if
needed. Never deletes anything.

Returns `{ path, size }` on success. Throws before any file is written if
the `receipt` object fails validation.

### `amountToHebrew(amount, currencyCode = 'ILS') -> string`

Converts a numeric amount to Hebrew words, including agorot / cents.

```js
amountToHebrew(1234.56)
// => "אלף מאתיים שלושים וארבעה שקלים וחמישים ושש אגורות"

amountToHebrew(1, 'ILS')        // => "שקל אחד"
amountToHebrew(2, 'ILS')        // => "שני שקלים"
amountToHebrew(0.01, 'ILS')     // => "אפס שקלים ואגורה אחת"
amountToHebrew(1000000, 'ILS')  // => "מיליון שקלים"
amountToHebrew(2000000, 'ILS')  // => "שני מיליון שקלים"
amountToHebrew(1000000000, 'ILS') // => "מיליארד שקלים"
amountToHebrew(5, 'USD')        // => "חמישה דולרים"
amountToHebrew(7.50, 'EUR')     // => "שבעה יורו וחמישים סנטים"
```

Supported range: `0 .. 999,999,999,999.99`.

Supported currencies: `ILS` (₪), `USD` ($), `EUR` (€). Unknown codes fall
back to `ILS` silently.

Grammar rules baked in:

* שקל / דולר / יורו are **masculine** → counts use masculine numerals
  ("שלושה", "ארבעה", "שלושים וארבעה").
* אגורה is **feminine** → counts use feminine numerals
  ("שלוש", "ארבע", "חמישים ושש").
* סנט is **masculine**.
* Scale words (אלף, מיליון, מיליארד) are masculine regardless of base
  currency, and use their frozen forms:
    * 1 → "אלף" / "מיליון" / "מיליארד"
    * 2 → "אלפיים" / "שני מיליון" / "שני מיליארד"
    * 3..10 thousand → "שלושת אלפים", "ארבעת אלפים", ..., "עשרת אלפים"
    * 11+ thousand → "<masculine count> אלף" ("אחד עשר אלף",
      "מאה עשרים וחמישה אלף")
    * 3+ million/billion → "<masculine count> מיליון" etc.

---

## Receipt shape

```js
const receipt = {
  // REQUIRED
  type: RECEIPT_TYPES.RECEIPT,          // or ON_ACCOUNT / TAX_INVOICE_RECEIPT
  receipt_number: 1042,                 // sequential — will be zero-padded to 6 digits on display
  issue_date: '2026-04-11',             // ISO date
  currency: 'ILS',                      // ILS (default) | USD | EUR
  amount_gross: 1234.56,

  issuer: {
    legal_name: 'טכנו-קול עוזי בע"מ',
    company_id: '515123456',            // ח.פ
    tax_file: '947123456',              // תיק ניכויים (optional)
    address: 'רחוב התעשייה 1, תל אביב', // optional
  },

  payer: {
    name: 'לקוח דוגמה בע"מ',
    tax_id: '514999888',                // ת.ז or ח.פ — optional
    tax_id_type: 'company',             // 'company' | 'person'
    address: 'רחוב הראשי 10, חיפה',     // optional
  },

  payment: {
    method: PAYMENT_METHODS.BANK_TRANSFER,
    // ...method-specific fields (see below)
    value_date: '2026-04-11',
  },

  // For TAX_INVOICE_RECEIPT only
  amount_before_vat: 1046.24,
  vat_amount: 188.32,
  vat_rate: 18,

  // Optional — array of invoices this receipt applies to
  invoice_refs: [
    { invoice_number: 'INV-2026-0123', date: '2026-04-01', amount: 1234.56 },
  ],
};
```

### Payment method variants

| Method | Additional fields |
|---|---|
| `cash` | (none required) |
| `credit_card` | `card_last4`, `card_brand`, `installments`, `auth_code` |
| `check` | `check_number`, `bank_name`, `bank_number`, `branch_number`, `account_number` |
| `bank_transfer` | `transfer_reference`, `bank_name` |
| `standing_order` | `transfer_reference` |
| `other` | `note` |

For credit cards, only the **last 4 digits** of the PAN are accepted —
the rendered PDF shows `**** **** **** 1234` (PCI-DSS friendly). Passing
a full PAN is a caller bug; the generator does not mask for you.

---

## Quick example

```js
const path = require('path');
const {
  generateReceiptPdf,
  RECEIPT_TYPES,
  PAYMENT_METHODS,
} = require('./src/receipts/receipt-pdf-generator.js');

const receipt = {
  type: RECEIPT_TYPES.TAX_INVOICE_RECEIPT,
  receipt_number: 1044,
  issue_date: '2026-04-11',
  currency: 'ILS',

  issuer: {
    legal_name: 'טכנו-קול עוזי בע"מ',
    company_id: '515123456',
    tax_file: '947123456',
  },

  payer: {
    name: 'לקוח דוגמה בע"מ',
    tax_id: '514999888',
    tax_id_type: 'company',
  },

  amount_before_vat: 1000.00,
  vat_rate: 18,
  vat_amount: 180.00,
  amount_gross: 1180.00,

  payment: {
    method: PAYMENT_METHODS.CREDIT_CARD,
    card_last4: '1234',
    card_brand: 'Visa',
    installments: 3,
    auth_code: 'A87654',
    value_date: '2026-04-12',
  },
};

const out = path.join(__dirname, 'out', 'receipts', 'R-001044.pdf');
const { path: filePath, size } = await generateReceiptPdf(receipt, out);
console.log(`wrote ${filePath} (${size} bytes)`);
```

---

## Tests

* **`test/amountToHebrew.test.js`** — 20 canonical cases (and additional
  error/rounding assertions) for the number-to-words conversion. Covers:
  zero, units, teens, tens, hundreds, thousands (exact + generic),
  millions, billions, decimal remainders, and USD / EUR.

* **`test/receipt-pdf-generator.test.js`** — smoke tests that actually
  run `generateReceiptPdf` against each receipt type, each payment
  method, and each currency, then verify the file was written and has a
  `%PDF-` header. Validation errors are tested by calling
  `validateReceipt` directly so we don't rely on the file system to
  confirm rejection.

Run them via:

```bash
node --test test/amountToHebrew.test.js
node --test test/receipt-pdf-generator.test.js
```

Generated PDFs are **left on disk** at `test/tmp-pdfs/receipt-*.pdf` for
manual inspection (useful to eyeball Hebrew rendering and the A4-split
layout). That directory is wiped of stale `receipt-*.pdf` files at the
start of each run.

---

## Non-deletion policy

Per the law that this agent operates under, this module **never deletes
files** — not temp files, not stale PDFs, not the target path (if the
target already exists, the `fs.createWriteStream` call overwrites it in
place, which is the conventional write semantics; no explicit `unlink`
is performed). The only mutating filesystem calls are `mkdirSync` (for
parent directories) and `createWriteStream` (for the target PDF). The
test file removes stale `receipt-*.pdf` files at the start of the run —
this is a caller/test convention, not a generator behaviour.

---

## Known limitations

* The Hebrew text is rendered via pdfkit's built-in Helvetica font,
  which Unicode-supports Hebrew glyphs but does **not** do BiDi ordering.
  For production-quality bidirectional layout you should swap in a
  Hebrew-capable font with `doc.registerFont('HeFont', 'path/to/font.ttf')`
  and use `doc.font('HeFont')` before drawing Hebrew text. See
  `src/payroll/pdf-generator.js` for the same caveat — we deliberately
  kept the dependency surface minimal.

* Amounts above 999,999,999,999.99 (one trillion) are not supported. A
  receipt that large is almost certainly a bug in the caller.

* The conversion uses the standard Israeli "ridgid" numeric style
  (e.g. "שלוש מאות תשעים ותשעה" rather than "שלוש מאות תשעים ותשע"
  with silent conjunction). If you need the alternate spelling,
  customise `hebrewUnder1000Masculine` / `hebrewUnder1000Feminine`.
