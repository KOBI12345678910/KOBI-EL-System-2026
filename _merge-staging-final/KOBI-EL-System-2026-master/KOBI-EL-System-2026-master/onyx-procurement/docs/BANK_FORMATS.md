# Bank Statement Formats — Reference

> **Status:** active
> **Owner:** ONYX Procurement / Bank module
> **Code:** `src/bank/multi-format-parser.js` (multi-format, additive) + `src/bank/parsers.js` (legacy CSV/MT940)
> **Tests:** `src/bank/multi-format-parser.test.js` (74 tests) + `test/bank-parsers.test.js` (25 tests)
> **Fixtures:** `src/bank/fixtures/`

This document catalogues every bank statement format ONYX can ingest,
what it looks like on disk, how we parse it, and the common
normalized schema every parser emits.

The original CSV + MT940 parsers in `src/bank/parsers.js` remain
untouched. The new `src/bank/multi-format-parser.js` module is
purely additive and extends coverage with OFX, QIF, CAMT.053, five
Israeli-bank CSV variants, and an optional PDF path.

---

## 1. Common normalized schema

Every successful parse emits an array of transactions conforming to
this shape:

```js
{
  transaction_date: 'YYYY-MM-DD',   // booking date (required)
  value_date:       'YYYY-MM-DD',   // settlement / value date (nullable)
  description:      string,         // free-text description
  reference:        string|null,    // bank reference / check # / E2E id
  amount:           number,         // SIGNED — credit positive, debit negative
  currency:         'ILS'|'USD'|'EUR'|'GBP'|...,
  balance:          number|null,    // running balance after the tx (nullable)
  type:             'credit'|'debit',
  counterparty_name: string|null,   // payer / payee if identifiable
  counterparty_iban: string|null,   // counterparty IBAN (CAMT.053 only)
  external_id:      string|null,    // provider-assigned unique id (OFX FITID, CAMT AcctSvcrRef, ...)
  source_format:    'ofx'|'qif'|'mt940'|'camt053'|'csv-il'|'pdf'
}
```

`amount` is **always** signed from the account holder's point of
view — money in is positive, money out is negative. Callers should
never need to inspect `type` to recover the sign.

---

## 2. Top-level API

`require('./multi-format-parser')` exports:

| Export | Kind | Description |
|---|---|---|
| `detectFormat(buffer)` | fn | Returns one of `SOURCE_FORMATS.*` or `'unknown'`. Works on Buffer or string. |
| `parseStatement(buffer, format?)` | fn | Returns `Array<NormalizedTransaction>`. Auto-detects when `format` omitted. Returns a `Promise` for PDFs; synchronous for every other format. |
| `normalizeTransaction(raw, format)` | fn | Turns one raw per-parser row into the common schema. |
| `SOURCE_FORMATS` | const | Enum of format identifiers. |
| `ISRAELI_BANKS` | const | Registry of Israeli bank CSV column maps. |
| `parseOfx / parseQif / parseMt940Raw / parseCamt053 / parseCsvIsraeli / parsePdf` | fn | Raw per-format parsers (return untransformed rows) — exposed for advanced callers / tests. |
| `_internal` | object | Low-level helpers (`parseDateFlexible`, `parseAmountFlexible`, `decodeWindows1255`, `xmlTag`, `splitCsvLine`, ...). |

### Example

```js
const fs = require('node:fs');
const { parseStatement, detectFormat } = require('./src/bank/multi-format-parser');

const buf = fs.readFileSync('statement.ofx');
console.log(detectFormat(buf));   // 'ofx'
const txs = await parseStatement(buf);
console.log(txs[0]);
//  {
//    transaction_date: '2026-04-01',
//    amount: 12500,
//    currency: 'USD',
//    type: 'credit',
//    ...
//  }
```

---

## 3. Supported formats

### 3.1 OFX 2.x (Open Financial Exchange)

- **Extension:** `.ofx`, `.qfx`
- **Encoding:** UTF-8 XML
- **Detection:** `<?xml ... <OFX ...>` or bare `<OFX>` root. (Legacy OFX 1.x SGML headers starting with `OFXHEADER:` are also detected.)
- **Source:** American banks, QuickBooks / Quicken exports, Chase, BoA, Wells Fargo, some international banks.
- **Key elements:** `<STMTTRN>` per transaction, with `<TRNTYPE>`, `<DTPOSTED>`, `<TRNAMT>` (already signed), `<FITID>` (unique id), `<NAME>`, `<MEMO>`, `<CHECKNUM>`. Currency comes from `<CURDEF>` in the statement envelope.
- **Date format:** `YYYYMMDDHHMMSS` (only `YYYYMMDD` is used).
- **Sign:** `<TRNAMT>` is already signed; we preserve the sign.
- **Fixture:** `src/bank/fixtures/fixture-ofx.ofx`

### 3.2 QIF (Quicken Interchange Format)

- **Extension:** `.qif`
- **Encoding:** 7-bit ASCII / UTF-8
- **Detection:** lines starting with `!Type:` (e.g., `!Type:Bank`, `!Type:CCard`).
- **Source:** Older Quicken exports, many US personal-finance tools.
- **Record format:** single-letter code at column 0, record terminator `^`. Codes we use:

  | Code | Meaning | Mapped to |
  |------|---------|-----------|
  | `D`  | Date    | `transaction_date` (US **MM/DD/YYYY**) |
  | `T`  | Amount  | `amount` (signed) |
  | `N`  | Check number / reference | `reference`, `external_id` |
  | `P`  | Payee   | `counterparty_name` |
  | `M`  | Memo    | appended to `description` |
  | `L`  | Category | ignored (no equivalent) |
  | `C`  | Cleared flag | ignored |

- **Date format:** US `MM/DD/YYYY` by default — handled by a dedicated QIF date parser.
- **Currency:** QIF has no currency; parser defaults to `USD`. Callers can post-process.
- **Fixture:** `src/bank/fixtures/fixture-qif.qif`

### 3.3 MT940 (SWIFT standard)

- **Extension:** `.sta`, `.txt`, `.940`
- **Encoding:** ASCII, CRLF or LF, 65-char line width
- **Detection:** leading `:20:` tag followed by `:60F:` / `:60M:` opening balance.
- **Source:** Corporate banking worldwide, most Israeli banks' "קובץ תנועות ריבועי" export, SEPA participants.
- **Tags we understand:**

  | Tag | Meaning |
  |-----|---------|
  | `:20:` | Statement reference |
  | `:25:` | Account identifier (IBAN or local) |
  | `:28C:` | Statement number |
  | `:60F:` / `:60M:` | Opening balance — `C/D` + `YYMMDD` + `CCY` + `amount` |
  | `:61:` | Statement line — booking date, value date, D/C indicator, amount, reference |
  | `:86:` | Free-text description (multi-line) |
  | `:62F:` / `:62M:` | Closing balance |

- **Date format:** `YYMMDD` (2-digit year, assumed 20YY).
- **Sign:** D = debit (negative), C = credit (positive).
- **Note:** This module ships a self-contained `parseMt940Raw` walker for independence. The richer `parseMt940Statement` in `src/bank/parsers.js` stays the canonical one for balance bookkeeping.
- **Fixture:** `src/bank/fixtures/fixture-mt940.txt`

### 3.4 CAMT.053 (ISO 20022, Bank-to-Customer Statement)

- **Extension:** `.xml`
- **Encoding:** UTF-8 XML
- **Detection:** `<BkToCstmrStmt>` element (namespace-prefixed or bare), or literal `camt.053` string in the first 4KB.
- **Source:** European banks (SEPA), any bank that speaks ISO 20022. Replaces MT940 in SEPA area.
- **Key elements:**

  | Element | Meaning |
  |---------|---------|
  | `<Stmt>` | One per statement |
  | `<Ntry>` | One per transaction |
  | `<Amt Ccy="EUR">` | Signed amount + currency (on the `Ccy` attribute) |
  | `<CdtDbtInd>` | `CRDT` or `DBIT` — we use this to sign the amount |
  | `<BookgDt><Dt>` | Booking date (`transaction_date`) |
  | `<ValDt><Dt>`   | Value date (`value_date`) |
  | `<AcctSvcrRef>` | Bank-assigned unique reference (`external_id`) |
  | `<EndToEndId>` / `<MndtId>` | Additional references |
  | `<RltdPties><Dbtr><Nm>` / `<Cdtr><Nm>` | Counterparty name |
  | `<RltdPties><DbtrAcct><IBAN>` / `<CdtrAcct><IBAN>` | Counterparty IBAN |
  | `<RmtInf><Ustrd>` | Unstructured remittance info |
  | `<AddtlNtryInf>` | Additional entry info (fallback for description) |

- **Date format:** ISO `YYYY-MM-DD`.
- **Sign:** explicit via `<CdtDbtInd>` — `DBIT` means negative.
- **Currency:** from the `Ccy` attribute on `<Amt>`.
- **Fixture:** `src/bank/fixtures/fixture-camt053.xml`

### 3.5 CSV — Israeli banks (`csv-il`)

All five supported Israeli banks are auto-detected from either (a)
a bank-identifying token in the first 2KB of the file, or (b)
column-header fingerprints.

- **Encoding:** UTF-8 is standard. Windows-1255 (Hebrew Windows code page) is supported — when UTF-8 decoding fails we fall back to an internal `decodeWindows1255` decoder covering Hebrew letters `U+05D0..U+05EA` and the `₪` sign (`0xA4 → U+20AA`).
- **Date format:** `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY` — Israeli convention.
- **Currency:** fixed to `ILS`; `₪` is stripped from amount fields during parsing.
- **Amounts:** quoted with `"`, comma thousands separator, `.` decimal separator.
- **Sign:** for banks that use split `חובה` / `זכות` columns we compute `credit − debit`; for banks with a single `סכום` column we parse the sign as-is (including trailing `-` and `(...)`).

#### Supported banks

| Bank id | Name | Tokens | Column header hints |
|---|---|---|---|
| `leumi` | Bank Leumi | `לאומי`, `Leumi` | `תאריך` / `תאריך ערך` / `תיאור` / `אסמכתא` / `חובה` / `זכות` / `יתרה` |
| `hapoalim` | Bank Hapoalim | `הפועלים`, `Hapoalim`, `טכנו קול` | `תאריך` / `תיאור תנועה` / `אסמכתא` / `חובה` / `זכות` / `יתרה לאחר תנועה` |
| `mizrahi` | Mizrahi Tefahot | `מזרחי`, `טפחות` | `תאריך` / `פרטי פעולה` / `אסמכתא` / `חובה` / `זכות` / `יתרה בש״ח` |
| `discount` | Bank Discount | `דיסקונט`, `Discount` | `תאריך עסקה` / `פרטי העסקה` / `מס' אסמכתא` / `חיוב` / `זיכוי` / `יתרה שוטפת` |
| `otsar-hahayal` | Otsar HaHayal | `אוצר החייל`, `Otsar` | `תאריך פעולה` / `תיאור פעולה` / `אסמכתא` / `חובה` / `זכות` / `יתרה לאחר פעולה` |

The registry is exported as `ISRAELI_BANKS`; adding a new bank is a
single entry at the top of the file. Auto-detection falls back to
Bank Hapoalim if no token matches (for backwards compatibility with
the existing generic CSV parser).

- **Fixtures:** `src/bank/fixtures/fixture-csv-leumi.csv`, `-hapoalim.csv`, `-mizrahi.csv`, `-discount.csv`, `-otsar.csv`.

### 3.6 PDF (optional)

- **Extension:** `.pdf`
- **Detection:** `%PDF` magic bytes at the start of the buffer (detected **before** any string conversion, so binary content is never corrupted).
- **Dependency:** soft-depends on [`pdf-parse`](https://www.npmjs.com/package/pdf-parse). The package is **not** in `package.json` by default — install it on demand:

  ```bash
  npm install pdf-parse
  ```

- **Behaviour without `pdf-parse`:** `parsePdf` throws an `Error` with `err.code === 'PDF_UNSUPPORTED'`. Callers that want a graceful skip should catch that code.
- **Extraction strategy:** heuristic line-matching — we look for lines of the form

  ```
  DD/MM/YYYY  <description>  <amount>  [<balance>]
  ```

  This works well for most Israeli statement exports but is NOT
  bit-accurate for arbitrary bank layouts. For high-fidelity work
  the CSV/MT940/CAMT.053 exports from the same bank are always
  preferred.

---

## 4. Detection priority

`detectFormat(buffer)` applies these checks in order; first hit wins:

1. **PDF** — `%PDF` magic bytes (requires a raw Buffer).
2. **OFX** — `<?xml ... <OFX>` declaration or bare `<OFX>` root (also matches OFX 1.x SGML headers).
3. **CAMT.053** — `<BkToCstmrStmt>` element or `camt.053` literal in first 4 KB.
4. **MT940** — `:20:` tag + `:60F:`/`:60M:` opening balance tag present.
5. **QIF** — leading `!Type:` header.
6. **Israeli CSV** — Hebrew `תאריך` header + any of (`חובה` | `זכות` | `סכום` | `יתרה`) in the first 4 KB.
7. **`unknown`** — return and let the caller decide.

---

## 5. Encoding handling

- **UTF-8 BOM:** stripped automatically (`EF BB BF`).
- **UTF-16 LE BOM:** auto-decoded (`FF FE`).
- **Windows-1255 (Hebrew):** triggered as a fallback when UTF-8 decoding produces replacement characters. Hebrew letters are mapped `0xE0..0xFA → U+05D0..U+05EA`; `0xA4 → U+20AA` (₪).
- **ASCII / 7-bit:** passes through untouched.

---

## 6. Tests & fixtures

| File | Size | Purpose |
|---|---|---|
| `src/bank/fixtures/fixture-ofx.ofx` | small | 3 OFX STMTTRN rows — credit wire, supplier debit, VAT refund |
| `src/bank/fixtures/fixture-qif.qif` | small | 5 QIF records — wire in, supplier, payroll, VAT refund, bank fee |
| `src/bank/fixtures/fixture-mt940.txt` | small | 5 `:61:` txns + open/close balances |
| `src/bank/fixtures/fixture-camt053.xml` | small | 3 `<Ntry>` entries — credit + two debits, one w/ IBAN counterparty |
| `src/bank/fixtures/fixture-csv-leumi.csv` | small | Bank Leumi — 6 rows, debit/credit split cols |
| `src/bank/fixtures/fixture-csv-hapoalim.csv` | small | Bank Hapoalim — 4 rows, "תיאור תנועה" header variant |
| `src/bank/fixtures/fixture-csv-mizrahi.csv` | small | Mizrahi Tefahot — 3 rows, "פרטי פעולה" header variant |
| `src/bank/fixtures/fixture-csv-discount.csv` | small | Discount — 4 rows, חיוב/זיכוי columns |
| `src/bank/fixtures/fixture-csv-otsar.csv` | small | Otsar HaHayal — 3 rows |

Run the multi-format parser test suite with:

```bash
node --test src/bank/multi-format-parser.test.js
```

Current pass rate: **74 / 74** tests green.

The legacy `test/bank-parsers.test.js` (25 tests) continues to pass
unchanged — this work is purely additive.

---

## 7. Relationship to `src/bank/parsers.js`

| Concern | `parsers.js` (existing) | `multi-format-parser.js` (new) |
|---|---|---|
| CSV (generic) | `parseCsvStatement` | — |
| MT940 | `parseMt940Statement` (rich, balance-aware) | `parseMt940Raw` (minimal, self-contained) |
| OFX / QIF / CAMT.053 | — | supported |
| Israeli-bank CSV (per-bank) | — | supported |
| PDF | — | optional (`pdf-parse`) |
| Normalized schema | internal per-parser shape | **single** common schema across all formats |
| Consumed by | `bank-routes.js` import endpoint | additive — callers opt in by importing explicitly |

The new module is designed to live **alongside** the existing
parsers, never replacing them. `bank-routes.js`, `matcher.js`, and
the test file `test/bank-parsers.test.js` are untouched.

---

## 8. Extending

### Adding a new Israeli bank

Open `src/bank/multi-format-parser.js`, locate the `ISRAELI_BANKS`
object, and add an entry:

```js
discountPremium: {
  id: 'discount-premium',
  name: 'Discount Premium',
  tokens: ['דיסקונט פרמיום', 'discount premium'],
  headers: {
    date: ['תאריך'],
    valueDate: ['תאריך ערך'],
    description: ['תיאור'],
    reference: ['אסמכתא'],
    debit: ['חובה'],
    credit: ['זכות'],
    amount: ['סכום'],
    balance: ['יתרה'],
  },
},
```

Drop a fixture in `src/bank/fixtures/` and extend
`multi-format-parser.test.js` with a matching assertion block.

### Adding a brand new format

1. Write a `parseFoo(text|buffer)` that returns an array of raw rows (each tagged with `_format: SOURCE_FORMATS.FOO`).
2. Write a `normalizeFoo(raw)` that returns a common-schema object.
3. Add the format identifier to `SOURCE_FORMATS`.
4. Register detection in `detectFormat()`.
5. Register dispatch in `parseStatement()` and `normalizeTransaction()`.
6. Export the new functions and add tests + a fixture.
