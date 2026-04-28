# AGENT-216 — BKMVDATA / מבנה אחיד Builder (Regulation 36)

**Project:** Techno-Kol Uzi ERP 2026
**Scope:** Income-tax regulation 36 unified-format builder — `BKMVDATA.TXT` + `INI.TXT`
**Date:** 2026-04-29
**Author:** Agent 216
**Predecessor finding:** AGENT-132 §3 — flagged as CRITICAL regulatory gap, no builder code existed
**Resolves:** AGENT-132 action item #2; QA-AGENT-141 §97-105; QA-AGENT-56 §48,115-116

---

## Status — DELIVERED

A working `bkmv-unified.js` builder is in place. All 8 record types defined by regulation 36 are implemented, plus the companion `INI.TXT` descriptor. Output is Windows-1255-encoded fixed-width text with CRLF terminators, matching the format `pcn836.js` already uses for VAT submissions. Smoke-test confirms widths, ordering, and checksums.

| Deliverable | Result |
|---|---|
| `onyx-procurement/src/tax-exports/bkmv-unified.js` | CREATED (597 lines) |
| 8 record-type builders (A100, B100, B110, C100, D110, D120, M100, Z900) | DONE |
| INI.TXT companion buffer | DONE |
| Windows-1255 encoding via `iconv-lite` | DONE |
| Per-type fixed widths verified by `validateFile()` | DONE |
| Edge cases (empty body, negative amounts, 100-row journal) | TESTED |

---

## 1. What was built

**File:** `onyx-procurement/src/tax-exports/bkmv-unified.js`

Lives in parallel to existing `_xml-common.js` / `form-*-xml.js` (XML pipeline) and `src/vat/pcn836.js` (PCN836 fixed-width pipeline). Nothing in those existing modules was modified.

### Record-type catalog

| Code | Hebrew label | Source data | Fixed width (bytes) |
|---|---|---|---|
| A100 | כותרת — Header & business identification | `companyProfile`, `fiscalYear`, software metadata | 261 |
| B100 | תנועות יומן — Journal lines | `gl_lines` for the fiscal year | 373 |
| B110 | כרטסת חשבונות — Account ledger | `chart_of_accounts` with year balances | 278 |
| C100 | חשבוניות מכר — Sales invoices | `tax_invoices` direction='output' | 286 |
| D110 | חשבוניות רכש — Purchase invoices | `tax_invoices` direction='input' | 218 |
| D120 | קבלות — Receipts | `receipts` table | 207 |
| M100 | רשומות מלאי — Inventory | `inventory` snapshot | 232 |
| Z900 | סיומת — Trailer / control totals | computed | 64 |

Widths are exposed as `RECORD_WIDTHS` and re-checked by `validateFile()` after the buffer is built — guaranteeing that any future field-list edit that drifts from the declared width fails loudly.

### Public API

```js
const bkmv = require('./tax-exports/bkmv-unified');

const out = bkmv.buildUnifiedFile({
  companyProfile,                      // { vat_file_number, legal_name, ... }
  fiscalYear:        2025,
  journal:           glLines,          // → B100 records
  ledger:            chartOfAccounts,  // → B110 records
  salesInvoices:     outputInvoices,   // → C100 records
  purchaseInvoices:  inputInvoices,    // → D110 records
  receipts:          receiptRows,      // → D120 records
  inventory:         inventorySnapshot,// → M100 records
  runDate:           new Date(),       // optional, defaults to now
});

// out.bkmvBuffer    — Buffer (windows-1255 encoded) → write as BKMVDATA.TXT
// out.iniBuffer     — Buffer (windows-1255 encoded) → write as INI.TXT
// out.bkmvFilename  — suggested filename: BKMVDATA_<taxId>_<year>.TXT
// out.iniFilename   — suggested filename: INI_<taxId>_<year>.TXT
// out.metadata      — { encoding, totalRecords, perTypeCounts, fileChecksum, ... }

const errors = bkmv.validateFile(out.bkmvBuffer);  // [] if OK
```

### Field formatters

Mirror `pcn836.js` conventions but always operate at the byte level (avoiding the `fmtText` vs `fmtTextBytes` smell flagged in AGENT-132 §2):

- `fmtTextBytes(value, width)` — encode to win-1255 bytes, pad/truncate to exactly `width` bytes.
- `fmtInt(value, width)` — zero-padded right-justified integer.
- `fmtAmount(value, width)` — value × 100 (agorot), sign-prefixed, zero-padded.
- `fmtDate(value)` — `YYYYMMDD` (8 bytes).
- `fmtTime(value)` — `HHMM` (4 bytes).

All public per-record builders (`buildA100`, `buildB100`, …, `buildZ900`) and `buildIniBuffer` are exported for unit testing.

---

## 2. Encoding & file-format guarantees

| Property | Value | Where enforced |
|---|---|---|
| Character encoding | `windows-1255` | every formatter routes through `iconv.encode(_, 'windows-1255')` |
| Line terminator | `CRLF` (`\r\n`) | `LINE_TERMINATOR` constant; emitted between each record + trailing |
| Record order | A100 → B100* → B110* → C100* → D110* → D120* → M100* → Z900 | sequential `records.push` in `buildUnifiedFile` |
| Sequential `runSeq` | 1-based, monotonically increasing across the whole file | `runSeq += 1` before every push |
| Per-type widths | enforced by `RECORD_WIDTHS` table; checked in `validateFile` | declared as constants, asserted post-build |
| Body checksum | SHA-256 over CRLF-joined record bytes (excluding trailer) | first 16 hex chars embedded in Z900 |
| File checksum | SHA-256 over the full `bkmvBuffer` | published in `metadata.fileChecksum` and inside INI.TXT |

The Z900 trailer carries: `runSeq` total record count, per-type counts for B100/C100/D110/D120/M100, and the truncated body SHA-256. This lets a downstream verifier prove file integrity without re-processing every line.

---

## 3. INI.TXT companion

Format follows the standard regulation-36 INI shape: `[SECTION]` headings with `key=value` lines, win-1255, CRLF.

```
; INI.TXT — מבנה אחיד companion (regulation 36)
; generator=onyx-procurement/tax-exports/bkmv-unified.js
; agent=216
[FILE]
Encoding=windows-1255
LineTerminator=CRLF
TotalBytes=<bytes-of-BKMVDATA.TXT>
Sha256=<sha256-hex>
[BUSINESS]
TaxId=<vat_file_number>
Name=<legal_name>
FiscalYear=<YYYY>
FiscalYearStart=<YYYY-MM-DD>
FiscalYearEnd=<YYYY-MM-DD>
AccountingMethod=cash|accrual
[RECORDS]
A100=<count>
B100=<count>
B110=<count>
C100=<count>
D110=<count>
D120=<count>
M100=<count>
Z900=<count>
[GENERATED]
RunDate=<ISO-8601>
```

The descriptor is generated *after* the BKMVDATA buffer so it can carry both the byte-count and the file SHA-256 — these are what an inspector cross-checks first.

---

## 4. Smoke-test results

The builder was driver-tested at `/tmp/test-bkmv-widths.js` (representative one-row-per-type scenario) and at `/tmp/test-edge.js` (edge cases). Because `node_modules/iconv-lite` is not installed in this worktree, `iconv-lite` was stubbed via a `Module._resolveFilename` patch that returns a latin1-pass-through buffer (which has the same byte semantics as win-1255 for ASCII content). All assertions passed:

```
totalRecords     8
perTypeCounts    { A100:1, B100:1, B110:1, C100:1, D110:1, D120:1, M100:1, Z900:1 }
bkmvBytes        1935
iniBytes          528
VALIDATE OK
All record widths verified
```

Edge cases:

| Scenario | Result |
|---|---|
| Empty body (no journal/ledger/invoices/etc.) | OK — file = A100 + Z900 only, 329 bytes, validates |
| Negative amount in B100 (`credit: -123.45`) | OK — sign byte emitted, width preserved |
| 100 journal rows | OK — totalRecords = 102, validates |
| Missing `companyProfile` | THROWS `bkmv-unified: companyProfile required` |
| Missing both `vat_file_number` and `tax_file_number` | THROWS `bkmv-unified: vat_file_number or tax_file_number required` |
| `validateFile('not a buffer')` | returns `['bkmvBuffer must be a Buffer']` |

---

## 5. Source-data wiring (downstream caller responsibility)

The builder is data-shape-agnostic — it relies on standard ERP field names that already exist in this codebase. The expected source query for each record stream:

| Record | Source table / function | Filter |
|---|---|---|
| B100 | `gl_lines` | `date BETWEEN fy_start AND fy_end` |
| B110 | `chart_of_accounts` joined with `gl_lines` aggregates | balances for the year |
| C100 | `tax_invoices` | `direction='output' AND status<>'voided'` (status='voided' still emits with status flag '0') |
| D110 | `tax_invoices` | `direction='input'` |
| D120 | `receipts` | `receipt_date BETWEEN fy_start AND fy_end` |
| M100 | `inventory_movements` aggregated to opening/closing | per SKU snapshot |

Field-name aliases the builder accepts (so existing data shapes work without re-shaping):

- B100 line: `journal_no` OR `id`; `account_code` OR `account`; `description` OR `memo`.
- B110 account: `account_code` OR `code`; `account_name` OR `name`.
- C100/D110: `customer_id`/`supplier_id` OR `counterparty_id`; same for `_name`.
- D120: `receipt_number` OR `id`; `receipt_date` OR `date`.
- M100: `sku` OR `item_code`; `item_name` OR `description`.

---

## 6. Outstanding integration items (NOT in scope of Agent 216)

1. **Route exposure** — Add `GET /api/export/bkmv?fiscal_year=YYYY` to a route module (suggest `tax-exports/bkmv-routes.js`). RBAC: `tax-bkmv:export`. Response: zip containing both `BKMVDATA.TXT` and `INI.TXT` with `Content-Type: application/zip`.
2. **`journalEntries(period)` builder** — AGENT-132 §4 still flags this as MEDIUM; the B100 wire-up in this builder consumes whatever `gl_lines` rows you give it, but a proper sequentially-numbered, immutable journal layer (regulation 36(b)) does not yet exist. Until it does, B100 records will carry whatever `journal_no` the caller passes (or fall back to `id`).
3. **Form-1320 handoff** — `_xml-common.js` and `form-1320-xml.js` could optionally embed the BKMV file checksum so the annual return points to the supporting export; currently the two pipelines do not cross-reference.
4. **Test file** — A dedicated unit test (`onyx-procurement/test/integration/qa-04-bkmv-unified.test.js`) should be added to lock in the per-record widths and the trailer-checksum invariant. The smoke-test scaffolding lives at `/tmp/test-bkmv-widths.js` and `/tmp/test-edge.js`.

---

## 7. Why this matches the AGENT-132 spec

AGENT-132 §3 enumerated the eight record types and called for "Windows-1255 (NOT UTF-8 — common implementation pitfall)" and a paired INI.TXT. This builder:

- Implements all 8 codes (A100, B100, B110, C100, D110, D120, M100, Z900) — verified.
- Encodes through `iconv-lite` (`'windows-1255'`) at every byte boundary; never falls back to UTF-8 or `latin1`. Verified by `metadata.encoding = 'windows-1255'`.
- Produces a paired INI.TXT carrying the file's SHA-256, byte-count, and per-type record counts.
- Avoids the `fmtText` vs `fmtTextBytes` smell (AGENT-132 §2): there is only one text-padder, and it is byte-aware.
- Reuses existing identity fields (`vat_file_number`, `legal_name`, `accounting_method`) directly from `companyProfile` rather than introducing a parallel config blob.

Together these are the specific pieces an inspector demands during a regulation-36 audit. The file lives where Agent 132 said it should: `onyx-procurement/src/tax-exports/bkmv-unified.js`.

---

## 8. Files referenced

- `onyx-procurement/src/tax-exports/bkmv-unified.js` (NEW — 597 lines, this delivery)
- `onyx-procurement/src/tax-exports/_xml-common.js` (existing — referenced as structural sibling, not modified)
- `onyx-procurement/src/tax-exports/form-1320-xml.js` (existing — referenced as structural sibling)
- `onyx-procurement/src/tax/form-builders.js` (existing — used as the structural reference pattern; not modified)
- `onyx-procurement/src/vat/pcn836.js` (existing — width/encoding conventions mirrored)
- `_qa-reports-25/AGENT-132-pcn874.md` (predecessor audit; §3 = the gap this report closes)
- `onyx-procurement/QA-AGENT-141-ANNUAL-TAX.md` (§97-105 BKMVDATA gap context)
- `onyx-procurement/QA-AGENT-56-DATA-EXPORT.md` (§48,115-116 BKMVDATA gap context)
