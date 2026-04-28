# AGENT-194 — PDF Invoice Parser Audit

**Date:** 2026-04-29
**Scope:** Independent audit of Agent-89's `pdf-invoice-parser.js` against the original delivery report `_qa-reports/AG-89-pdf-invoice-parser.md`. Verifies OCR engine, Hebrew RTL handling, table extraction, and vendor-matching readiness.
**Verdict:** **PASS (with one open wiring gap).** Parser is feature-complete, all 46/46 tests pass, but it is not yet wired into any HTTP route and has no supplier auto-matching layer. Both gaps were flagged as "next steps" in the original delivery report and remain open.

---

## 1. Artefacts under audit

| File | Lines | Status |
|---|---|---|
| `onyx-procurement/src/imports/pdf-invoice-parser.js` | 844 | Present, exports `parseInvoicePdf` + `parseInvoiceText` + `_internal` |
| `onyx-procurement/test/payroll/pdf-invoice-parser.test.js` | 459 | Present, 46 assertions across 8 suites |

Original report claimed 620 + ~test lines. Actual is 844 lines (parser grew during refinement); test file count consistent.

---

## 2. Test execution

```
$ node --test test/payroll/pdf-invoice-parser.test.js
ℹ tests 46
ℹ suites 8
ℹ pass 46
ℹ fail 0
ℹ duration_ms 500.4328
```

All 8 declared suites green: 5 fixtures (Iron Steel, Welding Gases, Cash Receipt, CNC Machining, Siemens English) + Edge cases (9) + `parseInvoicePdf` API (3) + `mock-supabase` integration (1). Matches the delivery report exactly.

---

## 3. OCR / text-extraction engine — verified

The parser exposes a **two-tier extraction strategy** at `parseInvoicePdf` (L776-810):

1. **Preferred:** lazy-loaded `pdf-parse` via `loadPdfParse()` (L133-140). Wrapped in try/catch — missing module returns `null` and falls through.
2. **Fallback:** zero-dep `extractTextFallback(buffer)` (L147-201) walks the raw bytes (Latin-1 view) and pulls three operand patterns:
   - `(text)Tj` parenthesised single-string operators (with backslash-escape decoding for `\(`, `\)`, `\\`, `\n`, `\r`)
   - `[(a)(b)]TJ` array-of-strings operator (TJ kerned text)
   - `<hex>Tj` hex-string operands (UTF-16BE for 4-byte groups, ASCII for 2-byte groups)

**Limitation confirmed (per original report §1):** `/FlateDecode` compressed content streams are **not** decoded by the fallback — the parser still returns a well-formed result with empty text rather than throwing. The result-shape contract (`vendor_vat_id: null`, `confidence: 0`, `extraction_engine: 'fallback'`) lets upstream code degrade to OCR.

**Open issue:** `pdf-parse` is NOT declared in `onyx-procurement/package.json` `optionalDependencies` (next-step #6 still open). In production, compressed-stream PDFs will silently degrade to fallback mode.

---

## 4. Hebrew / RTL handling — verified

Multiple RTL-aware mechanisms confirmed:

| Concern | Mitigation in code |
|---|---|
| RTL/LTR token reversal around labels | `extractVatId` (L312-335) and `extractAllocationNumber` (L453-470) search BOTH directions (60 chars before AND after the label) |
| Hebrew label variants `ע.מ`, `ח.פ`, `עוסק מורשה` | `RE_VAT_LABEL` (L86) accepts dotted, spaced, and English aliases |
| Right-to-left invisible marks (RLM/LRM/PDI) | `parseMoney` strips `‎‏‪-‮` before number parsing (L224) |
| Bilingual headlines | `DOC_TYPES` (L46-72) carries Hebrew + English regex pairs; `tax_invoice_receipt` is matched before `tax_invoice` to avoid superset-collision |
| Currency markers | `RE_MONEY` (L95) accepts `₪`, `ש"ח`, `ILS`, `NIS` on either side of the number |
| Hebrew dot-letter labels (`סה"כ`, `מע"מ`) | All total/subtotal/VAT regexes (L113-120) optionally accept the gershayim `"` |

**Confirmed claim:** Fixture 5 (Siemens English) parses to identical schema as Hebrew fixtures, validating bilingual coverage.

**Residual risk (per original §2):** if upstream OCR mangles `ע.מ` → `ע . מ`, the label regex still matches (whitespace-tolerant `\s*`), but if dots are dropped entirely the fallback to "any 9-digit token in first 500 chars at confidence 40" kicks in. Acceptable.

---

## 5. Table / line-item extraction — verified

`extractLineItems` (L484-571) implements the documented **tail-biased** strategy:

1. Skip rows that match subtotal/VAT/total/allocation labels (prevents bleed).
2. Require ≥3 numeric tokens per row.
3. **First pass:** take the LAST 3 numeric tokens as `(qty, unit_price, total)`. Validate `qty * price ≈ total` within `max(0.05, total * 0.01)`. This single guard kills the spurious-match risk from dimensions in descriptions (e.g. `50x50 מ"מ`).
4. **Fallback pass:** combinatorial search constrained to triples ENDING at the final token, picking the smallest residual.
5. Description = text before the first numeric token (or after the last, if numbers come first), with leading bullets stripped.

Verified against fixture 1 (3 items extracted with qty/price/total math passing) and fixture 4 (CNC, 3 items) — both included in the green test run. Confidence per-item caps at 90.

---

## 6. Cross-check math — verified

`crossCheckTotals` (L583-643) covers all four states:

| Inputs present | Behaviour |
|---|---|
| sub + vat + total | Validate `sub + vat ≈ total` within ₪0.05; pick best-fit VAT rate (18% vs 17%); +5 confidence boost |
| sub + total only | Infer `vat = total - sub`; rate-pick |
| sub + vat only | Infer `total = sub + vat`; rate-pick |
| vat + total only | Infer `sub = total - vat`; rate-pick |
| total only | Assume default 18%, derive sub & vat at confidence 55 |

`pickVatRate` (L645-658) iterates `VAT_RATES = [0.18, 0.17]` and returns the closer match. Edge-case test "cross-check accepts legacy 17% VAT rate" passes — confirms historical-invoice support.

---

## 7. Vendor matching — NOT IMPLEMENTED

**Gap confirmed.** The parser extracts `vendor_vat_id` (9-digit IL business ID) and `vendor` (free-text name) but does NOT join against the `suppliers.tax_id` column. This was listed as next-step #2 in the original report and is still pending.

`vendor` (L284-310) uses two heuristics:
1. Labelled extraction `שם ספק: …` at confidence 85.
2. Top-of-document line scan (skips numeric, label, and document-type lines) at confidence 60.

Original report's stated 85% accuracy on top-of-doc heuristic seems plausible but is not test-covered for accuracy regressions. The recommended `suppliers`-table post-processor would replace heuristic guesses with deterministic resolution by tax-id.

---

## 8. Wiring status — NOT WIRED

`grep -r "pdf-invoice|parseInvoicePdf"` across `onyx-procurement/src/` returns ONLY the parser file itself. The next-step #1 (`POST /api/imports/pdf-invoice` endpoint in `csv-import-routes.js`) is **not done**:

- `csv-import-routes.js` does not import `pdf-invoice-parser`.
- No multipart upload handler exists for PDFs.
- No `invoice_imports` staging table writes.

The parser is fully usable as a library but not reachable via HTTP. Until wired, supervisors cannot review parsed invoices through the UI.

---

## 9. Schema completeness — verified

`parseInvoiceText` (L701-767) returns all 14 fields named in CLAUDE.md / original spec:

`vendor`, `vendor_vat_id`, `invoice_no`, `invoice_date`, `line_items[]`, `subtotal`, `vat_amount`, `total`, `allocation_no`, `doc_type`, `doc_type_hebrew`, `vat_rate`, `totals_valid`, `inferred_fields[]`, `confidence`, `field_confidence{}`, `raw_text_length`, plus `extraction_engine` from `parseInvoicePdf`.

Field-level confidence map is exposed for UI threshold gating (next-step #5). The `_internal` namespace exposes 12 helpers + 7 regexes for unit testing — sound testability surface.

---

## 10. Findings summary

| # | Item | Severity | Status |
|---|---|---|---|
| 1 | All 46 unit tests pass | — | GREEN |
| 2 | OCR fallback works for uncompressed streams | — | OK |
| 3 | Hebrew/RTL bidirectional label search | — | OK |
| 4 | Tail-biased line-item extraction | — | OK |
| 5 | VAT cross-check 18%/17% with inference | — | OK |
| 6 | `pdf-parse` not in `optionalDependencies` | LOW | OPEN (next-step #6) |
| 7 | No HTTP route wiring (`POST /api/imports/pdf-invoice`) | MEDIUM | OPEN (next-step #1) |
| 8 | No supplier-table auto-match | MEDIUM | OPEN (next-step #2) |
| 9 | No allocation-number validation against רשות המסים | LOW | OPEN (next-step #3) |
| 10 | Multi-page PDFs: first-occurrence-wins for non-totals | LOW | KNOWN-LIMIT |
| 11 | FlateDecode compressed streams downgrade silently | LOW | DOCUMENTED |

---

## 11. Verdict

The **parser core is production-ready** and matches the delivery report. Test suite is comprehensive (46 assertions across 8 suites covering 5 realistic Israeli invoice fixtures + edge cases). Hebrew RTL, bilingual labels, רפורמת חשבונית 2024 allocation numbers, and dual-rate VAT cross-check are all correctly implemented.

**Blocker for end-to-end use:** the import pipeline cannot ingest PDFs until next-steps #1 (wire `POST /api/imports/pdf-invoice` in `csv-import-routes.js`) and #2 (supplier auto-match by `vendor_vat_id`) are implemented. Recommend assigning a follow-up agent to close these two items before promoting the parser to user-facing flows.

No regressions, no data-loss risk, no destructive operations — parser is pure read-only transform.
