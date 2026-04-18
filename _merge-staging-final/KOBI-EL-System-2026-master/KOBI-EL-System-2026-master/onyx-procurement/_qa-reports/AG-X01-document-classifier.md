# AG-X01 — Smart Document Classifier

**Agent:** X-01 (Swarm 3 — Advanced Features)
**Scope:** Techno-Kol Uzi Mega-ERP / Payroll + Procurement / ML layer
**Date:** 2026-04-11
**Node runner:** `node --test` (Node.js >= 18, built-in)
**Test result:** 63 / 63 passing (9 suites, 0 failures)
**External deps:** 0
**Existing files modified or deleted:** 0 (pure-additive, per Swarm rules)

---

## 1. Executive summary

A zero-dependency, Hebrew-bilingual document classifier that identifies the
type of an Israeli business document from raw text (OCR output, direct PDF
extraction, paste-from-email, etc.).

- Covers all **20** document types required by the task spec.
- Classification is done via a **weighted keyword-scoring model** with a
  **title-zone positional bonus** (matches near the top of the document
  get a 2.5× boost, matching how real Israeli business docs are formatted).
- Three keyword layers per type: **primary** (strong), **secondary**
  (supporting), and **negative** (anti-signals to demote false positives).
- Final confidence is produced via a soft normalisation that never returns
  NaN and never claims 100%.
- Fully deterministic — integer keyword weights, no RNG, no floats from
  model weights.

---

## 2. Deliverables

| # | File | Purpose | Size |
|---|------|---------|------|
| 1 | `onyx-procurement/src/ml/document-classifier.js` | Main module: classifier engine + rule book | ~28 KB |
| 2 | `onyx-procurement/test/payroll/document-classifier.test.js` | 36 fixtures + 27 support tests (63 total) | ~17 KB |
| 3 | `onyx-procurement/_qa-reports/AG-X01-document-classifier.md` | This report | — |

Directory `onyx-procurement/src/ml/` was newly created (did not previously
exist in the tree).

---

## 3. Supported document types (20)

| Key                   | Hebrew                | English                           |
|-----------------------|-----------------------|-----------------------------------|
| `tax_invoice`         | חשבונית מס            | Tax Invoice                       |
| `tax_invoice_receipt` | חשבונית מס/קבלה        | Tax Invoice Receipt               |
| `receipt`             | קבלה בלבד             | Receipt Only                      |
| `purchase_order`      | הזמנת רכש             | Purchase Order                    |
| `delivery_note`       | תעודת משלוח           | Delivery Note                     |
| `proforma`            | חשבון עסקה            | Proforma / Payment Request        |
| `wage_slip`           | תלוש שכר              | Wage Slip                         |
| `form_106`            | טופס 106              | Form 106 (Annual Employee Summary)|
| `form_161`            | טופס 161              | Form 161 (Separation Report)      |
| `one_time_notice`     | הודעה חד פעמית         | One-Time Notice                   |
| `night_batch`         | פלט ערב               | Night Batch Report                |
| `quote`               | הצעת מחיר             | Quote                             |
| `financial_report`    | דוח חשבונאי           | Financial Report                  |
| `pnl`                 | דוח רווח והפסד         | Profit and Loss                   |
| `balance_sheet`       | מאזן                  | Balance Sheet                     |
| `bank_voucher`        | פתקית בנק             | Bank Voucher                      |
| `contract`            | חוזה                  | Contract                          |
| `order`               | הזמנה                 | Order                             |
| `service_agreement`   | הסכם שירות            | Service Agreement                 |
| `opinion`             | חוות דעת              | Opinion                           |

---

## 4. Architecture

### 4.1 Scoring model

```
score(type) =
      Σ primary_hit(kw) × w × (title_bonus ? 2.5 : 1)
    + Σ secondary_hit(kw) × w
    − Σ negative_hit(kw) × w
```

- **Primary** keywords: the strongest indicator of the document type.
  These are usually the actual document title strings as they appear at
  the top of an Israeli form (e.g. "חשבונית מס", "תלוש שכר", "טופס 106").
- **Secondary** keywords: supporting-context words that a typical
  document of this type will contain in its body (e.g. for a wage slip:
  "ברוטו", "נטו", "ביטוח לאומי", "נקודות זיכוי").
- **Negative** keywords: anti-signals that explicitly demote a type when
  found. Example: the presence of "תלוש שכר" heavily demotes
  `tax_invoice` so that hybrid wage slips never get misclassified.

### 4.2 Title zone

The first 20% of the normalised text (minimum 120 characters) is the
"title zone". Primary keyword matches whose **first** occurrence falls in
the title zone are multiplied by `TITLE_ZONE_BONUS = 2.5`. This matches
how Israeli business forms are typically laid out, where the
document-type title is always top-centred.

### 4.3 Confidence normalisation

```
confidence = score / (score + mean_of_positive_others + 1)
```

Clamped to `[0, 0.99]` — the model never claims 100% certainty from
keyword matching alone. Typical confidence values:

- Clean single-type document: 0.6 – 0.9
- Type with strong context but no negative signals: 0.4 – 0.7
- Noisy / overlapping document: 0.3 – 0.5

### 4.4 Text normalisation

Before scoring, input text is normalised to handle common OCR quirks:

- Strip bidi marks (U+200E/U+200F, U+202A-U+202E, U+2066-U+2069)
- Strip soft hyphens (U+00AD)
- Replace NBSP (U+00A0) with space
- Normalise en/em dash variants to ASCII hyphen
- Normalise curly quotes to straight quotes
- Collapse runs of whitespace
- Normalise line endings

This means the classifier is robust to text produced by the existing
`src/ocr/invoice-ocr.js` module as well as any PDF extractor.

---

## 5. Public API

All exports are defined in `onyx-procurement/src/ml/document-classifier.js`.

### `classify(text, opts?)`
Returns the top N predictions (default 3).

```js
const { classify } = require('./document-classifier');
const preds = classify(ocrText);
// → [
//     {
//       type: 'tax_invoice',
//       type_he: 'חשבונית מס',
//       type_en: 'Tax Invoice',
//       confidence: 0.82,
//       score: 91.5,
//       keywords_matched: ['חשבונית מס', 'עוסק מורשה', 'מע"מ', ...],
//       primary_hits: 3,
//     },
//     ...
//   ]
```

Options:
- `topN` (default 3) — max predictions
- `minScore` (default 0.5) — absolute score threshold

### `classifyBatch(documents[], opts?)`
Batch version. Accepts:
- array of strings → `[{id: 'doc-1', predictions: [...]}, ...]`
- array of `{id, text}` objects → `[{id, predictions: [...]}, ...]`

### `getKeywords(type)`
Returns the rule book for a given type (defensive copy — safe to mutate).
Shape: `{label_he, label_en, primary, secondary, negative}`.

### `getSupportedTypes()`
Returns the full list of 20 type keys.

### `getTypeLabel(type)`
Returns the Hebrew label for a type, or `null` if unknown.

### `_internal`
White-box access to `normalize`, `countOccurrences`, `firstIndex`,
`isInTitleZone`, `scoreType`, `computeConfidence`, `RULES`, `TYPE_LIST`,
and the tuning constants. Used by the unit tests; not intended for
production consumers.

---

## 6. Test coverage

**Test file:** `onyx-procurement/test/payroll/document-classifier.test.js`

**Suites (9):**

| # | Suite | Tests |
|---|-------|------:|
| 1 | API contract                      | 11 |
| 2 | fixtures — tax invoice family     |  6 |
| 3 | fixtures — procurement family     |  7 |
| 4 | fixtures — payroll family         |  6 |
| 5 | fixtures — finance / accounting   |  4 |
| 6 | fixtures — contracts & legal      |  3 |
| 7 | fixtures — edge cases             | 10 |
| 8 | internals (white-box)             | 13 |
| 9 | consistency / regression guards   |  3 |
| **Total** |                           | **63** |

**Fixtures:** 36 (more than the required 30), covering every one of the
20 supported types, plus 16 edge-case / stress tests:

- Unicode artefacts (bidi marks, NBSP, em dash, soft hyphen)
- Multi-type documents (wage slip that mentions "חשבונית")
- Title-zone bonus verification
- Short-text classification
- Batch API (string arrays, object arrays, empty array, error cases)
- Negative-keyword demotion
- Self-label consistency across all 20 types

**Result:**

```
ℹ tests 63
ℹ suites 9
ℹ pass 63
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 205.6083
```

**How to run:**

```bash
cd onyx-procurement
node --test test/payroll/document-classifier.test.js
```

---

## 7. Israeli compliance notes

- Hebrew labels are the primary identifiers in user-facing output.
- The classifier is **non-destructive**: it does not mutate input, does
  not persist anything, and never makes network calls.
- All keyword matching is unicode-safe via plain JavaScript string
  operations (no regex construction per call, no locale-sensitive APIs).
- Special Israeli document types (טופס 106, טופס 161, פלט ערב, חשבון
  עסקה, פתקית בנק) have dedicated rules rather than being lumped into
  generic categories.
- Terms like "עוסק מורשה", "מע\"מ", "ביטוח לאומי", "קרן השתלמות",
  "נקודות זיכוי" are used as secondary signals where appropriate — this
  grounds the classifier in real Israeli accounting / payroll context.

---

## 8. Integration hooks (for downstream agents)

The classifier is designed to plug directly into the existing pipelines
without touching any existing files:

- **OCR pipeline** (`src/ocr/invoice-ocr.js`): pass the extracted text
  through `classify()` before routing to a type-specific parser. If the
  top prediction is `tax_invoice` or `tax_invoice_receipt`, continue to
  the invoice parser; otherwise route to the appropriate handler.
- **Email ingestion** (`src/emails/*`): run incoming attachment text
  through `classifyBatch()` for triage.
- **Scanners** (`src/scanners/*`): use the classifier as a pre-step
  before scanner-specific extraction.
- **Payroll** (`src/payroll/*`): use the classifier to distinguish
  between טופס 106, טופס 161, תלוש שכר, and ad-hoc one-time notices
  during bulk document import.
- **Reports** (`src/reports/*`): use the classifier to auto-tag uploaded
  supporting documents.

No changes to any of those modules are required — the classifier is a
standalone pure function with a simple contract.

---

## 9. Non-goals / future work

- The model is intentionally **rule-based, not ML-based**. Israeli
  business documents are highly templated, so a well-tuned keyword model
  reaches very high accuracy with zero runtime cost, no training data,
  no model file distribution, and no GPU. A future agent could layer a
  fastText-style embedding model on top — but only if real-world
  accuracy numbers justify the added complexity and dependency.
- The classifier does **not** extract fields (numbers, dates, amounts,
  party names). That is the job of a type-specific parser downstream.
- The classifier does **not** perform OCR. It consumes text produced by
  an OCR stage upstream.

---

## 10. Compliance checklist

| Requirement                                   | Status |
|------------------------------------------------|--------|
| Zero external dependencies                    | PASS   |
| Hebrew bilingual (he + en)                    | PASS   |
| Israeli-specific document types covered       | PASS (20/20) |
| No existing files deleted / modified          | PASS   |
| 30+ fixtures in test file                     | PASS (36 fixtures) |
| Exports: `classify`, `classifyBatch`, `getKeywords` | PASS |
| Test suite green                              | PASS (63/63) |
| Runs on Node's built-in `node:test`           | PASS   |
| Deterministic output (same input → same output) | PASS |
| Robust to OCR noise (bidi, nbsp, soft hyphen) | PASS   |

---

**Signed off:** Agent X-01
**Swarm:** 3 (advanced features)
**Module status:** READY FOR INTEGRATION
