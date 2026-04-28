# AGENT-132 — PCN874 + Israeli Tax Filings Audit

**Project:** Techno-Kol Uzi ERP 2026
**Scope:** PCN874 (monthly VAT summary), PCN836 (transaction detail), מאזן בוחן (trial balance), יומן ראשי (general journal), מבנה אחיד (BKMVDATA / INI.TXT)
**Date:** 2026-04-29
**Auditor:** Agent 132
**Inputs:** `onyx-procurement/src/vat/`, `onyx-procurement/src/tax-exports/`, `onyx-procurement/src/gl/`, `onyx-procurement/src/reporting/`, supporting tests, prior reports AGENT-19 / QA-141 / QA-56.

---

## Status — FAIL with PARTIAL

Two of the three Israeli statutory filing files are missing from the codebase. PCN836 (transaction-level detail) is implemented correctly, but PCN874 (the actual monthly summary that must accompany every VAT submission) and the Income Tax "מבנה אחיד" file (BKMVDATA.TXT + INI.TXT, regulation 36) have **no builder code at all**.

| Check | Result | Severity |
|---|---|---|
| PCN874 monthly summary builder | **MISSING** — no `pcn874.js` file | CRITICAL |
| PCN836 transaction detail | OK — `src/vat/pcn836.js`, A/B/C/D/Z, win-1255 | OK |
| PCN836 windows-1255 file write | OK — `vat-routes.js:191` writes `file.buffer` | OK |
| PCN836 fmtText vs fmtTextBytes | **MIXED** — fmtTextBytes exists but unused | MEDIUM |
| מבנה אחיד / BKMVDATA.TXT (reg 36) | **MISSING** — no module, no endpoint | CRITICAL |
| INI.TXT companion file | **MISSING** | CRITICAL |
| מאזן בוחן (Trial Balance) | OK — `src/gl/financial-statements.js#trialBalance` | OK |
| יומן ראשי (General Journal) | PARTIAL — GL lines exist, no יומן export | MEDIUM |
| Quarterly VAT XML (alt path) | OK — `tax-exports/vat-rashut-hamisim-xml.js` | OK |
| Form 1320 / 126 / 1301 / 102 / 857 / SHV XML | OK — `tax-exports/*-xml.js` | OK |

---

## 1. PCN874 — CRITICAL GAP

PCN874 is the **monthly VAT summary** (sales total, purchases total, net VAT due / refundable) — the file that the gov.il/she-am portal actually reads on the 15th of each month. It is the *headline* of every VAT submission; PCN836 is the supporting detail.

**Search results:**
- `Glob('**/pcn874*')` → no files found.
- `Grep('PCN874|pcn874')` → only documentation references (COMPLIANCE_CHECKLIST.md, AGENT-19 report, UI labels in `erp-app/src/pages/reports/financial/report-vat.tsx:100` and `erp-app/src/pages/finance/israeli-integrations.tsx:139`), DB schema fields (`pcn874_generated`, `pcn874_file_url`, `pcn874_submission_date` in `erp-app/ERP_FULL_SPECIFICATION.md:7027-7029`), but **no builder, no encoder, no test, no route**.

**What exists instead:**
- `vat-routes.js GET /api/vat/periods/:id` (line 83) computes period totals from `tax_invoices` on the fly. These are the *numbers* that would go into PCN874, but they are returned as JSON only.
- `tax-exports/vat-rashut-hamisim-xml.js` is the modern **XML-shape** quarterly VAT submission. It is not PCN874 (different format, different cadence, different portal endpoint).

**Impact:** If רשות המסים rejects the new XML pipeline (e.g. legacy SHA"AM endpoint), the system has no fallback and will miss the 15th-of-month statutory deadline. AGENT-19 already flagged this as HIGH; this audit confirms the gap is unchanged.

**Fix:** Add `onyx-procurement/src/vat/pcn874.js` mirroring the PCN836 layout. Spec details (per gov.il publication):
- Single-record file (no A/B/C/D/Z multi-record structure).
- Fixed-width ASCII, Windows-1255, CRLF terminator.
- Fields: ת.ז.עוסק (9), period YYYYMM (6), total taxable sales × 100 (15), total VAT on sales × 100 (12), total purchases × 100 (15), total VAT input × 100 (12), net VAT × 100 signed (12), submission type (1), submission date YYYYMMDD (8).

---

## 2. PCN836 — IMPLEMENTED CORRECTLY (with one residual smell)

`onyx-procurement/src/vat/pcn836.js` (275 lines):
- Records A (header, 92 chars), B (summary, 113), C (input, 76), D (output, 76), Z (trailer, 60). Per-type widths verified against `validatePcn836File` `RECORD_WIDTHS` map (line 248).
- Uses `iconv-lite` to encode the joined string to a windows-1255 Buffer (line 213). `metadata.encoding = 'windows-1255'`.
- SHA-256 over the encoded buffer for archival hash (line 214). Determinism verified by QA-02 unit tests.
- BUG-08 fix is applied in `vat-routes.js:191`: `fs.writeFileSync(archivePath, file.buffer)` writes the **iconv-encoded Buffer**, not the JS string with `'binary'` encoding. The previous `'binary'` write that silently truncated Hebrew code points is gone.

**Residual smell — `fmtText` vs `fmtTextBytes`:**

The encoder defines two padders:
- `fmtTextBytes(value, width)` (line 38) — encodes to windows-1255 bytes first, then pads/truncates to `width` *bytes*. Correct.
- `fmtText(value, width)` (line 61) — pads to `width` *JS code units*. Incorrect for variable-byte fields with Hebrew content.

**Every `buildHeaderRecord` / `buildInvoiceRecord` / `buildSummaryRecord` call uses `fmtText` (lines 101, 106, 107, 128, 140-147, 161-162) — `fmtTextBytes` is exported but never used.** For pure-ASCII content the two are identical; for Hebrew company names or invoice descriptions the JS-char-width fmtText produces a `content` string of N chars but a `buffer` of N+k bytes (k = number of Hebrew code points), which violates the fixed-width spec.

The QA-03 integration test (`test/integration/qa-03-pcn836-encoding.test.js`) explicitly documents this as BUG-08a/f/g and asserts the byte-width drift exists. The test is labeled "RESOLVED" only for the validator's per-type width dispatch (BUG-08e), not for the encoder. **The encoder is still char-width-padding.** For ASCII-only company names today this works, but any Hebrew company name in `legal_name` or Hebrew invoice number / description will produce a non-spec-compliant file.

**Recommendation:** Switch all `fmtText` call sites in pcn836.js to `fmtTextBytes`, then build the buffer from the byte-padded record bytes directly (skipping the JS-string concat). Until then, gate the production submit endpoint on `companyProfile.legal_name` being ASCII-only.

---

## 3. מבנה אחיד / BKMVDATA — CRITICAL REGULATORY GAP

Israeli Income Tax regulation 36 (תקנות מס הכנסה ניהול פנקסי חשבונות, 1973) mandates that any computerized accounting system must export the "קובץ אחיד" — a fixed-format text file (BKMVDATA.TXT + companion INI.TXT) on demand to a tax inspector. Required record types:

| Record | Content |
|---|---|
| A100 / A200 | File header + opening summary |
| B100 | תנועות יומן (journal entries) |
| B110 | כרטסת חשבונות (account ledger) |
| C100 | חשבוניות מכר (sales invoices) |
| D110 | חשבוניות רכש (purchase invoices) |
| D120 | קבלות (receipts) |
| M100 | רשומות מלאי (inventory records) |
| Z900 | Trailer |

**Encoding:** Windows-1255 (NOT UTF-8 — common implementation pitfall).
**Header:** INI.TXT — describes which BKMVDATA records the file actually contains.

**Search results:**
- `Glob('**/bkmv*')` → no files.
- `Glob('**/movein*')` → no files.
- `Grep('BKMVDATA|MOVEIN|מבנה אחיד')` → only `QA-AGENT-141-ANNUAL-TAX.md:97-105`, `QA-AGENT-56-DATA-EXPORT.md:48,115-116`, both of which document the gap as a regulatory blocker. Zero builder code.

**Impact:** Tax inspector audit triggers a 30-day window to produce the file. Inability to do so is a regulatory violation under הוראות מס הכנסה (ניהול פנקסי חשבונות) and exposes the company to fines + retroactive book invalidation.

**Fix:** Build `onyx-procurement/src/tax-exports/bkmv-unified.js` — fixed-width Windows-1255, eight record types, plus paired INI.TXT generator. Source data: `gl_lines` (B100/B110), `tax_invoices` direction=output (C100), tax_invoices direction=input (D110), receipts table (D120), inventory_movements (M100). Header summary computed from row counts and totals.

---

## 4. מאזן בוחן + יומן ראשי

**Trial balance — OK:**
`onyx-procurement/src/gl/financial-statements.js` (Agent X-40) provides `trialBalance(period, opts)` returning `{accounts[], totals, balanced}` with bilingual labels (`LABELS.trialBalance = { he: 'מאזן בוחן' }`). Form 6111 chart-of-accounts classification is in `src/reporting/balance-sheet.js`. Tested at `test/payroll/financial-statements.test.js`.

**General journal (יומן ראשי) — PARTIAL:**
GL line shape is defined (lines 60-72: id, account, date, debit, credit, currency, fx_to_ils, entity, source, source_id), and lines feed all five statements. **There is no dedicated journal-export endpoint or `journalEntries(period)` function** that would produce a chronological, sequentially-numbered, immutable journal as required by regulation 36(b). For the יומן ראשי submission (B100 record in BKMVDATA), the GL lines exist as raw material but the formal journal builder/numbering layer is absent.

**Recommendation:** Add `journalEntries(period, opts)` to `src/gl/financial-statements.js` returning rows ordered by `(date, posting_seq)` with stable `journal_no` (sequential per fiscal year, never reused after delete — DB-enforced via SEQUENCE + NOT NULL).

---

## 5. Header / structure / totals checks (PCN836 specific)

| Check | Verified at | Result |
|---|---|---|
| First record is 'A' header | `validatePcn836File` line 243 | OK |
| Second record is 'B' summary | line 244 | OK |
| Last record is 'Z' trailer | line 245 | OK |
| Per-type record widths | lines 248-258, RECORD_WIDTHS map | OK (after BUG-08e fix) |
| Trailer record count includes itself | `pcn836.js:200` `total: lines.length + 1` | OK |
| Body checksum SHA-256 over CRLF-joined lines | line 205 | OK |
| File checksum SHA-256 over encoded buffer | line 214 | OK |
| Amount × 100 (agorot) padding | `fmtAmount` lines 47-53 | OK |
| Negative-amount sign handling | line 50, sign char + leading zeros | OK (covered by qa-02 1.04) |
| Allocation number (Invoice Reform 2024) on C/D | line 146 | OK |
| Period type bi_monthly → '2' | `buildHeaderRecord` line 103 | OK |
| Submission type amendment → '2' | line 105 | OK |

**Encoding contract:** `metadata.encoding = 'windows-1255'`. The route at `vat-routes.js:237` correctly sets `Content-Type: text/plain; charset=windows-1255` on download. No UTF-8 fallback path.

---

## 6. Action items (priority order)

1. **[CRITICAL] Build `src/vat/pcn874.js`** — monthly VAT summary, win-1255, fixed-width single record. Mirror PCN836 conventions (iconv-lite buffer, SHA-256, period_label filename). Add `POST /api/vat/periods/:id/pcn874` route. Tests: structural + Hebrew company name byte-count.
2. **[CRITICAL] Build `src/tax-exports/bkmv-unified.js`** + INI.TXT generator. Tie into a new `GET /api/export/bkmv?fiscal_year=YYYY` endpoint with RBAC (`tax-bkmv:export`). Spec source: gov.il "מבנה אחיד לקובץ נתונים" PDF.
3. **[HIGH] Switch pcn836 encoder fmtText → fmtTextBytes** at every call site, or add a Hebrew-content guard. Currently the buffer width is data-dependent for any non-ASCII field.
4. **[MEDIUM] Add `journalEntries()` builder** to `src/gl/financial-statements.js` with sequential `journal_no`. Required for B100 record in BKMVDATA and for רגולטור reg 36(b) integrity.
5. **[MEDIUM] Add audit_log immutability + 7-year retention** (regulation 36(b)(1)) — flagged earlier in QA-141 §2.5.

---

## 7. Files referenced

- `onyx-procurement/src/vat/pcn836.js` (275 lines, encoder)
- `onyx-procurement/src/vat/vat-routes.js` (Express routes, archive write at line 191)
- `onyx-procurement/src/tax-exports/index.js` (XML form barrel — 1320, 857, 126, 1301, 102, VAT-Q, SHV)
- `onyx-procurement/src/tax-exports/vat-rashut-hamisim-xml.js` (quarterly XML, alt to PCN874)
- `onyx-procurement/src/gl/financial-statements.js` (trial balance, balance sheet, P&L, cash flow, equity)
- `onyx-procurement/src/reporting/balance-sheet.js` (Form 6111 classifier)
- `onyx-procurement/test/integration/qa-03-pcn836-encoding.test.js` (BUG-08 evidence — encoder still uses fmtText)
- `onyx-procurement/test/unit/qa-02-pcn836.test.js` (edge-case coverage)
- `onyx-procurement/QA-AGENT-141-ANNUAL-TAX.md` (BKMVDATA gap context)
- `onyx-procurement/QA-AGENT-56-DATA-EXPORT.md` (BKMVDATA gap context)
- `_qa-reports-25/AGENT-19-il-compliance.md` (prior compliance audit, same PCN874 finding)
