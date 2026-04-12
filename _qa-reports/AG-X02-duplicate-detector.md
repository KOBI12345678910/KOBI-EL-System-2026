# AG-X02 — Duplicate Bill / Invoice Detector
**Agent:** X-02 | **Swarm:** 3 | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 43/43 tests green

---

## 1. Scope

A zero-dependency fuzzy-matching engine that scans a batch of accounts-payable
bills and flags pairs/groups that look like duplicate entries before they are
paid twice. Built entirely with Node's built-ins (no lodash, no fuse.js, no
date-fns, no ICU).

Delivered files
- `onyx-procurement/src/dedup/duplicate-detector.js` — the library
- `onyx-procurement/test/payroll/duplicate-detector.test.js` — 43 tests
- `_qa-reports/AG-X02-duplicate-detector.md` — this report

RULES respected
- Zero dependencies (only `node:*` built-ins)
- Hebrew bilingual labels on every signal (`label_he` + `label_en`)
- Never deletes — the module is a pure, non-mutating reporter
- Real code, no stubs, fully exercised by the test suite

---

## 2. Public API

```js
const {
  findDuplicates,   // (bills[]) → Group[]
  isDuplicate,      // (bill1, bill2) → {duplicate, confidence, signals}
  normalizeHebrew,  // (str) → cleaned string
  levenshtein,      // (a, b) → integer
} = require('./src/dedup/duplicate-detector.js');
```

`Group` shape:
```js
{
  primary: <bill>,                // earliest-dated bill in the group
  candidates: [<bill>, ...],      // everyone else
  signals: [<Signal>, ...],       // aggregated over every edge
  combined_confidence: 0.0..1.0,  // max signal score in the group
}
```

`Signal` shape:
```js
{
  code: 'S1_EXACT' | 'S2_VENDOR_TOTAL_7D' | 'S3_VENDOR_NEAR_TOTAL_14D'
       | 'S4_SIMILAR_VENDOR_EXACT_TOTAL' | 'S5_SIMILAR_DESC_SAME_AMOUNT'
       | 'S6_REFERENCE_REUSE' | 'S0_SAME_REF',
  score: 0.0..1.0,
  label_en: <English sentence>,
  label_he: <Hebrew sentence>,
  detail:   <debug payload>,
  flag?:    true,   // only on S6 "review, do not auto-merge"
}
```

---

## 3. Signal ladder (implemented & tested)

| Code                              | Weight | Condition                                                                 |
|-----------------------------------|--------|---------------------------------------------------------------------------|
| `S1_EXACT`                        | 1.00   | same vendor + same invoice_no + same total (to the agora)                 |
| `S2_VENDOR_TOTAL_7D`              | 0.90   | same vendor + same total + date within 7 days                             |
| `S3_VENDOR_NEAR_TOTAL_14D`        | 0.75   | same vendor + totals within ±1% + date within 14 days                     |
| `S4_SIMILAR_VENDOR_EXACT_TOTAL`   | 0.80   | Levenshtein(vendorKeys) < 3 + exact total + date within 7 days            |
| `S5_SIMILAR_DESC_SAME_AMOUNT`     | 0.60   | Jaccard(descriptions) ≥ 0.60 + exact total                                |
| `S6_REFERENCE_REUSE`              | 0.55   | same vendor + same check/reference number → flagged for human review      |

Group confidence = `max(signal.score)` (conservative — doesn't inflate).
Pair is reported as a duplicate when `confidence >= 0.5`.

---

## 4. Hebrew normalization pipeline

Implemented zero-dep Unicode-aware normalizer with these stages:

1. NFKC compose (handles pre-composed vs decomposed forms)
2. Strip niqqud: U+0591..U+05BD, U+05BF, U+05C1..U+05C2, U+05C4..U+05C5, U+05C7
3. Map final letters: ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ (so "ירושלים" == "ירושלימ")
4. Strip zero-width / bidi controls (U+200B..U+200F, U+202A..U+202E, U+2066..U+2069, U+FEFF)
5. Strip common punctuation (quotes, gershayim ", geresh ', dashes, periods, brackets)
6. Collapse whitespace runs to a single space
7. Lowercase Latin letters
8. Trim

Tested across niqqud vs bare letters, final-letter folding, OCR gershayim
variants, bidi pollution, null/undefined, mixed Hebrew+English.

---

## 5. Levenshtein distance

Zero-dep iterative DP with two rolling rows → O(min(|a|,|b|)) space, O(|a|·|b|)
time. Handles null/undefined, empty strings, Hebrew, unicode. Symmetric by
construction. Verified on classic cases (`kitten`→`sitting` = 3, etc.).

---

## 6. Test coverage

```
tests      43
passed     43
failed      0
duration  ~150ms
```

Cases by area:

| Area                                  | Count |
|---------------------------------------|-------|
| Hebrew normalization                  |   7   |
| Levenshtein                           |   6   |
| Utilities (amounts, dates, vendor key, jaccard) |   6   |
| Signal S1 — exact                     |   2   |
| Signal S2 — vendor+total 7d           |   2   |
| Signal S3 — near total 14d            |   2   |
| Signal S4 — similar vendor            |   2   |
| Signal S5 — similar description       |   2   |
| Signal S6 — reference reuse           |   2   |
| Negative controls                     |   3   |
| Batch grouping (`findDuplicates`)     |   6   |
| Real-world mixed scenarios            |   4   |
| **Total**                             | **43**|

All 43 tests pass on Node's built-in `node:test` runner:

```
node --test onyx-procurement/test/payroll/duplicate-detector.test.js
```

---

## 7. Defensive behavior

- `isDuplicate(null, anything)` → `{duplicate: false, confidence: 0, signals: []}`
- `findDuplicates(null)` / `findDuplicates([])` / `findDuplicates([oneBill])` → `[]`
- `parseAmount` returns `NaN` for unparseable values and NaN never matches anything
- `parseDate` returns `NaN` for unparseable values and NaN-diff is Infinity (fails every window)
- Inputs are never mutated (verified with JSON snapshot round-trip test)
- Identical object reference short-circuits with confidence 1.0 and a synthetic `S0_SAME_REF` signal
- Deterministic ordering of groups (by confidence desc, then by primary index) so UIs don't jitter

---

## 8. Bilingual compliance check

Every emitted signal object carries both `label_en` and `label_he` fields and
both are non-empty strings. Verified programmatically in the test suite
(`real-world: bilingual labels present on every signal`).

---

## 9. Zero-dep compliance check

`package.json` of `onyx-procurement` was NOT touched. The new module imports
nothing. The test file imports only:
- `node:test`
- `node:assert/strict`
- `path`
- the module under test

No new dev- or runtime dependencies were introduced anywhere in the tree.

---

## 10. Sign-off

- Library: implemented, documented inline, zero-dep, non-mutating
- Tests: 43/43 passing on Node 18+
- Bilingual: yes, on every signal
- Never-delete: yes, the module only reports
- QA report: this file

**Recommendation:** APPROVE for integration into the AP review UI. Wire
`findDuplicates(bills)` into the bills-review screen and render
`combined_confidence` + grouped signals for the operator.
