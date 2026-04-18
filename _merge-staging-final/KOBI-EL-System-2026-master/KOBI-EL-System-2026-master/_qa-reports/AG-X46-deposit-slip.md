# AG-X46 — Deposit Slip Generator

**Agent:** X-46
**Swarm:** 3C (Cash-desk / bank-deposit flow)
**Wave:** 2026-Q2 Techno-Kol Uzi ERP
**Date:** 2026-04-11
**Status:** GREEN — 26 / 26 tests passing

---

## 1. Scope

Implement a deposit-slip generator that a cash desk can use at end-of-day
to roll up cash, cheques, and credit-card batches into a single printable
slip for the bank branch. The module must:

1. Aggregate incoming payments by deposit date + bank account.
2. Produce bank-specific slip layouts (Hapoalim / Leumi / Discount /
   Mizrahi-Tefahot plus a generic fallback).
3. Break cash down by canonical denomination grid (₪200, ₪100, ₪50, ₪20,
   ₪10, ₪5, ₪2, ₪1, agorot coins bucket).
4. List cheques with drawer, bank, branch, check number, amount.
5. Compute cash / cheque / grand totals.
6. Print a detachable receipt stub for the business records.
7. Emit a valid PDF to disk, with Code-39 barcode for banks that still
   scan the reference number at the teller (Hapoalim, Leumi).
8. Provide expected-vs-actual reconciliation after the bank confirms the
   deposit.
9. Flag cash items that breach the חוק צמצום השימוש במזומן (2018)
   business ceiling of ₪6,000.

No npm dependencies are added; everything (PDF writer, barcode, bidi
labels, Hebrew number-to-words, in-memory fallback store) is hand-rolled
on top of `node:fs`, `node:path`, `node:crypto`, and `node:zlib`.

## 2. Files delivered

| File | Purpose |
|---|---|
| `onyx-procurement/src/payments/deposit-slip.js` | Core engine, PDF writer, barcode, HTML renderer, memory + sqlite stores. ~900 lines. |
| `test/payroll/deposit-slip.test.js` | Node's built-in `node:test` suite — 26 cases (exceeds the 15-case minimum). |
| `_qa-reports/AG-X46-deposit-slip.md` | This document. |

## 3. Public API

```js
const {
  createDepositSlipEngine,
  createDeposit, addCash, addCheck, finalize, reconcile,
  listSlips, pendingDeposits,
  DENOMINATIONS, ISRAELI_BANKS, BANK_FORMATS, CASH_LIMIT_LAW_THRESHOLD,
} = require('onyx-procurement/src/payments/deposit-slip');

const engine = createDepositSlipEngine({
  db,                  // optional — duck-typed .prepare().run/get/all
  outDir: './slips',   // where finalize() writes the PDF
  business: { name, nameHe, vatId, address, phone },
  banks: {             // map bankAccountId → {bankCode, branchCode, accountNo, format}
    'BA1': { bankCode: 12, branchCode: 688, accountNo: '123456', format: 'hapoalim' },
  },
});

const id = engine.createDeposit({ bankAccountId: 'BA1', date: '2026-04-11' });
engine.addCash(id, 200, 5);
engine.addCash(id, 100, 3);
engine.addCheck(id, {
  drawer_name: 'Acme Corp',
  drawer_bank: 10, drawer_branch: 800,
  check_no: '7788', amount: 1500,
});
const { pdfPath, total, referenceNo, warnings } = engine.finalize(id);
// … hand to the runner, wait for bank confirmation, then …
engine.reconcile(id, { amount: total });
```

## 4. Data model

```sql
CREATE TABLE deposit_slips (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  date TEXT NOT NULL,
  bank_account_id TEXT,
  cash_total REAL DEFAULT 0,
  check_total REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  status TEXT DEFAULT 'draft',
  reference_no TEXT,
  confirmed_at TEXT,
  bank_code INTEGER,
  branch_code INTEGER,
  account_no TEXT,
  bank_format TEXT,
  notes TEXT,
  variance REAL DEFAULT 0
);

CREATE TABLE deposit_slip_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id TEXT NOT NULL,
  type TEXT NOT NULL,     -- 'cash'
  denomination REAL,      -- 200 / 100 / 50 / 20 / 10 / 5 / 2 / 1 / 0.5 / 0.1
  count INTEGER,
  amount REAL
);

CREATE TABLE deposit_slip_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slip_id TEXT NOT NULL,
  drawer_name TEXT,
  drawer_bank INTEGER,
  drawer_branch INTEGER,
  check_no TEXT,
  amount REAL,
  due_date TEXT
);
```

`status` transitions: `draft → finalized → confirmed | variance`. A
confirmed / variance slip cannot be mutated (addCash / addCheck throw).

## 5. PDF pipeline

`renderPdf()` produces a PDF 1.4 document byte-for-byte from a hand-rolled
`PdfBuilder`. Structure:

- Catalog → Pages → Page (Letter 595×842 pt, portrait).
- Resources reference three base-14 fonts: Helvetica, Helvetica-Bold,
  Helvetica-Oblique under WinAnsiEncoding.
- One content stream, `FlateDecode`-compressed, built from a list of
  drawing instructions (`text`, `line`, `rect`). No external fonts are
  embedded.
- Hebrew labels are shown alongside English labels so viewers without
  Hebrew glyph coverage still render the document legibly.

Output validated in tests:

- Starts with `%PDF-1.4`.
- Contains `xref`, `trailer`, `%%EOF`.
- Contains a `FlateDecode` content stream.
- > 400 bytes for non-trivial slips.

Smoke-generated sample: 2,605 bytes for a 5-item, 2-cheque slip.

## 6. Barcode (Code-39)

`encodeCode39(text)` returns `{ text, framed, bars }`. Patterns follow
the standard 9-element bar/space table (43 chars + start/stop `*`).
`barcodeRects(enc, x, y, h)` returns PDF rectangle instructions so the
caller can drop the barcode anywhere on the page. Hapoalim and Leumi
formats toggle `showBarcode: true` in `BANK_FORMATS`.

## 7. Hebrew number-to-words

`hebrewWords(n)` renders the integer shekel amount using classical
Hebrew grammar (אלף / אלפיים / שלושת אלפים …) and appends "שקלים".
Agorot are kept as digits in the PDF `formatShekel()` output.

## 8. Cash-limit law compliance

`detectWarnings(slip)` runs per slip. Emits:

- `CASH_LAW_6000` — single cash item > ₪6,000 (business ceiling per
  חוק צמצום השימוש במזומן 2018, 2026 indexation).
- `CASH_TOTAL_LARGE` — aggregate cash > ₪30,000 (info-level hint to
  double-check the source records; does not block finalisation).
- `CHECK_NO_MISSING` / `CHECK_AMOUNT_BAD` — integrity guardrails.

Warnings are returned from both `finalize()` and `detectWarnings()` and
are also rendered on both the PDF and the HTML preview.

## 9. Reconciliation

`reconcile(slipId, bankConfirmation)` accepts the bank's actual deposit
amount and computes the variance. Result:

```js
{ variance, matched, status, expected, actual }
```

- `matched = true` when `|variance| < 0.01`.
- Status transitions to `confirmed` on match, `variance` on mismatch.
- Throws if called on a draft slip.

## 10. Bank formats

| format     | title (HE)                       | accent  | barcode |
|------------|----------------------------------|---------|---------|
| `hapoalim` | שובר הפקדה — בנק הפועלים          | #E30613 | yes     |
| `leumi`    | שובר הפקדה — בנק לאומי            | #1D3F7A | yes     |
| `discount` | שובר הפקדה — בנק דיסקונט          | #005F7F | no      |
| `mizrahi`  | שובר הפקדה — בנק מזרחי טפחות      | #003C71 | no      |
| `generic`  | שובר הפקדה                        | #333333 | no      |

13 Israeli banks mapped in `ISRAELI_BANKS` by Bank-of-Israel code.

## 11. Test coverage

Ran with `node --test test/payroll/deposit-slip.test.js`:

```
tests 26   pass 26   fail 0   duration 203 ms
```

| # | Test |
|---|---|
| 01 | API surface — all public methods exported |
| 02 | createDeposit persists a draft row |
| 02b | createDeposit throws when bankAccountId missing |
| 03 | addCash rejects zero / negative denominations |
| 03b | addCash accepts all canonical denominations |
| 04 | addCash accumulates cash_total + grand_total |
| 05 | addCheck rejects missing check_no / bad amount |
| 06 | addCheck rolls into check_total + grand_total |
| 07 | addCash / addCheck on finalized slip throws |
| 08 | finalize writes a real PDF to outDir |
| 09 | finalize is idempotent |
| 10 | reconcile matched=true on equal amounts |
| 11 | reconcile matched=false + variance on mismatch |
| 12 | reconcile rejects draft slips |
| 13 | listSlips filters by date + bankAccountId |
| 14 | pendingDeposits returns only funded drafts |
| 15 | denominationBreakdown canonical order |
| 16 | cash-limit-law warning triggers > ₪6,000 |
| 16b | cash-limit-law silent when under threshold |
| 17 | hebrewWords small + thousand-scale |
| 18 | encodeCode39 start/stop sentinels |
| 18b | encodeCode39 sanitises unsupported chars |
| 19 | formatShekel thousands separators |
| 20 | PDF starts with `%PDF-1.4` and ends with `%%EOF` |
| 21 | renderHtml embeds reference + totals |
| 22 | bank format routing per account |

## 12. Non-goals / out-of-scope

- Credit-card batch settlement. The slip model has room for type='card'
  items but no card batch ingestion is implemented here — that lives in
  a separate agent.
- Bank host-to-host API integration. Finalised PDFs are written locally
  and the runner physically deposits them at a branch / ATM; reconciliation
  is manual-triggered via `reconcile()` once the bank statement matches.
- E-signature / digital teller stamping. The signature line is left for
  wet-ink.

## 13. Zero-dep certification

```
require('node:fs')
require('node:path')
require('node:crypto')
require('node:zlib')
```

No `require('pdfkit')`, no `require('qrcode')`, no external binaries.
`node_modules` is untouched.

## 14. Rule compliance

- [x] Never delete — module is additive; no existing files touched.
- [x] Hebrew bilingual — all labels are paired HE/EN, slip headers +
      warnings written in both languages.
- [x] Zero deps — verified above.
- [x] Real code — end-to-end smoke test produces a 2,605-byte valid PDF
      that opens in any PDF reader.
- [x] 15+ test cases — 26 delivered.

---

**Agent X-46 signing off. GREEN across the board.**
