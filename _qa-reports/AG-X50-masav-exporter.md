# AG-X50 — Masav Bank File Exporter (מס"ב)
**Agent:** X-50 | **Swarm:** 3C | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 40/40 tests green, zero dependencies

---

## 1. Scope

A zero-dependency encoder/decoder for the Israeli interbank mass payment
file format operated by מס"ב — מרכז סליקה בנקאי (Masav). Powers salary
batches, supplier payment runs, standing-order debits, and return-file
reconciliation in Kobi's mega-ERP for Techno-Kol Uzi.

The format is a 120-char fixed-width flat file with three record types:

| Type | Purpose | Layout |
|---|---|---|
| `1` | Header   | sender bank/branch/account/id + batch serial + date + type + purpose |
| `2` | Detail   | recipient bank/branch/account + amount aggurot + name + id + reference + txCode |
| `9` | Trailer  | sender bank + serial + record count + total aggurot + control hash |

All numeric fields are right-justified zero-padded. All alpha fields are
left-justified space-padded. Amounts are stored in *aggurot* (1/100 NIS)
as 11-digit ints. Hebrew names are transliterated to ASCII by default and
can be passed through verbatim under `encoding:'cp862'` for legacy
mainframe channels.

Delivered files
- `onyx-procurement/src/bank-files/masav-exporter.js` — encoder/decoder/PDF (615 LOC)
- `test/payroll/masav-exporter.test.js` — 40 tests across 8 suites (410 LOC)
- `_qa-reports/AG-X50-masav-exporter.md` — this report

RULES respected
- Zero dependencies — only `node:crypto`, `node:fs`, `node:path`, `node:os`
- Hebrew compliance — bilingual rejection reasons, CP862 pass-through mode, transliteration mapper for 22-letter alphabet (including final-form letters ך ם ן ף ץ)
- Never deletes — `cancelBatch` only marks state; exported batches are frozen-immutable; lines and metadata persist in the store
- Real code fully exercised by 40 unit tests
- Authentic Masav format — 120-char fixed-width records, aggurot amount field, control hash derived from bank+branch+account+aggurot sum mod 10^16

---

## 2. Public API

```js
const {
  createBatch,        // ({sender,type,date,purpose?,encoding?}) → batchId
  addPayment,         // (batchId, line) → void
  validateBatch,      // (batchId) → {valid, errors[]}
  exportFile,         // (batchId) → {file_content, line_count, total_amount, control_hash, sha256}
  parseReturnFile,    // (content) → {confirmations[], rejections[], header, trailer}
  buildSummary,       // (batchId, outPath?) → {path, bytes}
  cancelBatch,        // (batchId, reason?) → void  (state-only, keeps data)
  getBatch,           // (batchId) → frozen snapshot
  listBatches,        // (filter?) → array
  ISRAELI_BANKS,      // frozen bank-code lookup
  RECORD_TYPE,        // {HEADER:'1', DETAIL:'2', TRAILER:'9'}
  BATCH_TYPE,         // {PAYMENT, COLLECTION, RETURNS}
  BATCH_STATE,        // {DRAFT, VALIDATED, EXPORTED, CANCELLED}
  _internal,          // helpers exposed for tests
} = require('./src/bank-files/masav-exporter.js');
```

Typical usage (salary batch):

```js
const id = createBatch({
  sender:  { bank:'12', branch:'637', account:'12345', id:'100000009', name:'TECHNO KOL UZI LTD' },
  type:    BATCH_TYPE.PAYMENT,
  date:    new Date('2026-04-25'),
  purpose: 'SALARIES 04/2026',
});
addPayment(id, { bank:'10', branch:'800', account:'9000001', amount:12345.67, name:'עובד אלף', id:'100000017', reference:'SAL-042026-001' });
// ... more lines
const v = validateBatch(id);
if (!v.valid) { console.error(v.errors); return; }
const out = exportFile(id);
fs.writeFileSync('salaries-apr2026.masav', out.file_content);
const pdf = buildSummary(id);    // human-readable PDF for the finance team
```

---

## 3. Record layout (implemented positions, 0-based slices)

### Header (type 1)
| Slice | Width | Field |
|---|---|---|
| 0-1   | 1  | Record type (`1`) |
| 1-4   | 3  | Sender bank |
| 4-7   | 3  | Sender branch |
| 7-12  | 5  | Sender account |
| 12-21 | 9  | Sender company ID (ח.פ) |
| 21-27 | 6  | Batch serial |
| 27-33 | 6  | Creation date YYMMDD |
| 33-39 | 6  | Value date YYMMDD |
| 39-41 | 2  | Type code (01=payment, 02=collection) |
| 41-71 | 30 | Purpose text |
| 71-120| 49 | Filler (spaces) |

### Detail (type 2)
| Slice | Width | Field |
|---|---|---|
| 0-1   | 1  | Record type (`2`) |
| 1-4   | 3  | Recipient bank |
| 4-7   | 3  | Recipient branch |
| 7-20  | 13 | Recipient account |
| 20-24 | 4  | In-batch serial |
| 24-35 | 11 | Amount in aggurot |
| 35-55 | 20 | Recipient name |
| 55-64 | 9  | Recipient ID / ח.פ |
| 64-74 | 10 | Reference / invoice |
| 74-80 | 6  | Transaction / reason code |
| 80-120| 40 | Filler |

### Trailer (type 9)
| Slice | Width | Field |
|---|---|---|
| 0-1   | 1  | Record type (`9`) |
| 1-4   | 3  | Sender bank (repeat) |
| 4-10  | 6  | Batch serial |
| 10-16 | 6  | Creation date YYMMDD |
| 16-22 | 6  | Total detail count |
| 22-35 | 13 | Total aggurot |
| 35-51 | 16 | Control hash |
| 51-120| 69 | Filler |

All three record types are emitted exactly `RECORD_LENGTH = 120` chars
wide. A runtime check asserts the invariant on every line before the file
is handed back to the caller.

---

## 4. Israeli bank-code seed (frozen table)

17 bank codes shipped as a frozen object (`ISRAELI_BANKS`):
Yahav (04), Postal Bank (09), **Leumi (10)**, **Discount (11)**,
**Hapoalim (12)**, Igud (13), Otzar HaChayal (14), Mercantile (17),
**Mizrahi Tefahot (20)**, UBank/Union (26), First Intl (31),
Arab-Israel (34), Massad (46), Poalei Agudat (52), **Jerusalem (54)**,
Mizrahi-68, Jerusalem-77.

Each entry carries `{ he, en, active }`. `isValidBankCode` accepts both
2- and 3-digit codes and handles the leading-zero padding both banks'
Masav-facing systems actually use.

---

## 5. Validation rules

`validateBatch(batchId)` runs every check below and returns
`{ valid, errors: [{ index?, field?, message }] }` — it never throws on
data issues, only on programmer errors (unknown batchId).

- Sender bank must be in `ISRAELI_BANKS`
- Sender ID must pass Luhn-like ת"ז checksum
- Batch must contain ≥ 1 detail line
- Per-line:
  - Recipient bank in `ISRAELI_BANKS`
  - Branch = 1-3 digits
  - Account = 1-13 digits
  - Amount > 0 and ≤ 99,999,999.99 (fits 11-digit aggurot field)
  - Name present and non-empty
  - Recipient ID passes Luhn
  - Reference unique across the batch (catches double-submit bugs)

`exportFile()` silently calls `validateBatch()` first and refuses to emit
anything if the batch fails. This keeps the bank file clean by
construction — no "send-now-catch-later" surprises.

---

## 6. Control hash

```
sum of BigInt(bank3) + BigInt(branch3) + BigInt(account13) + BigInt(aggurot)
      for every detail line,
      taken mod 10^16, emitted as decimal string.
```

BigInt is used because the 16-digit hash overflows `Number`. The hash is
stored back on the batch after export so `buildSummary` and the trailer
both reproduce the same value. The test suite checks the hash is stable
across two independently-built batches that share the same detail rows.

---

## 7. PDF summary (zero deps)

`buildSummary(batchId, outPath?)` emits a single-page A4/Letter PDF 1.4
with Courier 10pt containing:

- Batch ID, type, state
- Sender name, bank, branch, company ID
- Date, total, control hash, purpose
- Column header + first 25 detail rows, truncated with `... (N more)`

The renderer is a self-contained ~50-line PDF writer (`_renderMinimalPdf`)
that hand-assembles the Catalog/Pages/Page/Contents/Font objects, builds
an xref table, and writes `%%EOF`. No external PDF libraries — this
matches the "zero deps" rule and keeps the exporter deployable to
air-gapped machines the finance team runs.

Tests verify the output begins with `%PDF-` and ends with `%%EOF`, and
that the file is writable to both an explicit path and the OS tmpdir.

---

## 8. Return-file parser

`parseReturnFile(content)` reads a Masav response from the bank and
classifies every detail record by its 6-digit transaction code. All-zero
codes mean confirmation; anything else is a rejection with a bilingual
Hebrew/English human-readable reason text:

| Code | Reason |
|---|---|
| 001 | חשבון לא קיים / Account not found |
| 002 | חשבון סגור / Account closed |
| 003 | יתרה לא מספקת / Insufficient funds |
| 004 | מוטב נפטר / Beneficiary deceased |
| 005 | מס"ב מסרב לחיוב / Masav debit refused |
| 006 | הוראה בוטלה / Standing order cancelled |
| 007 | פרטי חשבון שגויים / Invalid account details |
| 008 | סניף סגור / Branch closed |
| 009 | זיהוי לקוח לא תקין / Invalid customer ID |
| 010 | שם מוטב לא תואם / Beneficiary name mismatch |
| 099 | שגיאה טכנית / Technical error |
| *   | Fallthrough: "קוד דחייה {code} / Reject code {code}" |

Short lines are space-padded before slicing so malformed files don't
crash the parser — the "never delete, always keep" rule also applies to
degraded input.

---

## 9. Test results

```
▶ createBatch                            5/5  ✔
▶ addPayment                             4/4  ✔
▶ validateBatch                          7/7  ✔
▶ exportFile                             8/8  ✔
▶ parseReturnFile                        4/4  ✔
▶ buildSummary                           2/2  ✔
▶ helpers                                7/7  ✔
▶ never-delete                           3/3  ✔

ℹ tests 40        ℹ suites 8         ℹ pass 40
ℹ fail  0         ℹ cancelled 0      ℹ skipped 0
ℹ duration_ms ~180
```

Run with: `node --test test/payroll/masav-exporter.test.js`

40 checks across 8 suites covering:
- Happy path (createBatch → addPayment → validateBatch → exportFile)
- Immutability (no addPayment after export or cancel)
- Rejection paths (unknown bank, bad Luhn, zero amount, over-cap amount, duplicate reference, empty batch)
- Format correctness (exactly 120-char records, header bank at pos 1-4, aggurot at 24-35)
- Determinism (two batches with identical rows produce identical detail+trailer bytes)
- Return-file round-trip (export → patch txCode → parse → classify)
- Trailer metadata preservation (count + controlHash)
- PDF validity (magic bytes + %%EOF)
- Helper micro-tests (padNumeric, padAlpha, transliterateHebrew, isValidIsraeliId, formatDateYYMMDD)
- Bank seed coverage (Leumi, Discount, Hapoalim, Mizrahi, Jerusalem)
- Never-delete semantics (cancel keeps data; exported batches cannot be cancelled)

---

## 10. File locations

| Path | Purpose |
|---|---|
| `onyx-procurement/src/bank-files/masav-exporter.js` | Encoder/decoder/PDF writer (all API) |
| `test/payroll/masav-exporter.test.js` | 40-test unit suite |
| `_qa-reports/AG-X50-masav-exporter.md` | This report |

## 11. Notes for downstream integration

1. **Salaries path** — wire `createBatch → addPayment(forEach employee) → exportFile` into the payroll routes; the returned `file_content` is ready to upload to any bank's Masav SFTP dropbox.
2. **Supplier payments** — same API, same type. Set `purpose` to the PO batch ID so the return file can be matched back automatically.
3. **Collection runs** — use `type: BATCH_TYPE.COLLECTION` and pass the customer's bank/branch/account. The format writes type code `02` into header positions 39-41.
4. **Return-file reconciliation** — run the nightly job on each `*.rsp` file the bank drops; feed rejections into the AR aging report and re-queue confirmations as paid.
5. **Audit trail** — every exported batch carries its own SHA-256 (`sha256` on the export result and `getBatch()` snapshot). Store it next to the bank upload receipt for non-repudiation.
6. **Compliance** — Luhn Israeli-ID check matches the rule used by `onyx-procurement/src/validators/company-id-validator.js` (see AG-94). Bank-code coverage maps 1:1 against the IBAN validator (AG-92).
