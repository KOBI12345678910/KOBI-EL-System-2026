# AG-Y111 — OCR Pipeline Orchestration

**Agent:** Y111
**Project:** Techno-Kol Uzi mega-ERP (Kobi EL 2026)
**Module:** `onyx-procurement/src/documents/ocr-pipeline.js`
**Test:**   `onyx-procurement/test/documents/ocr-pipeline.test.js`
**Date:**   2026-04-11
**Rule:**   לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)

---

## 1. Summary

Delivered an orchestration layer (`OCRPipeline` class) that sits above any OCR
backend — tesseract, Google Cloud Vision, Azure Document Intelligence, AWS
Textract, or a caller-supplied custom function — and handles:

- Backend registration with priority and language coverage
- Intelligent routing by language hint + priority
- Ordered fallback (primary → secondary → tertiary) on failure or low
  confidence
- A configurable confidence threshold (low-confidence results cascade)
- Per-document-type post-processing (invoice, receipt, id-card, teudat-zehut,
  rishiyon-esek, mill-cert, general)
- Schema-driven structured field extraction (pattern OR keyword)
- Layout, table, and handwriting analyses via pluggable capability methods
- Sensitive-data redaction (Israeli ID, credit card, IBAN-IL, email, phone)
- Batch processing with a concurrency cap
- Quality checks (sanity assertions against expected fields)
- Hebrew normalisation (niqqud strip, final-letter folding, bidi strip)

**Core contract: zero external deps.** The module requires nothing beyond Node
built-ins. Every backend is injected as a `config.transport` function, so real
SDKs (`@google-cloud/vision`, `tesseract.js`, `@azure/ai-form-recognizer`, the
AWS SDK) are wired by `server.js` — never imported here. That is what makes
the pipeline fully testable without network, cloud credentials, or native
binaries.

**Tests:** `node --test test/documents/ocr-pipeline.test.js` — **39 / 39
passing** across 13 test groups.

## 2. Files created

| Path | Purpose |
|---|---|
| `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\documents\ocr-pipeline.js` | OCRPipeline class, helpers, constants |
| `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\documents\ocr-pipeline.test.js` | 39 unit tests |
| `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y111-ocr-pipeline.md` | This report |

## 3. Public API

```js
const { OCRPipeline } = require('./documents/ocr-pipeline');

const pipeline = new OCRPipeline({
  clock: () => new Date(),             // injected for determinism
  rng: { random: Math.random },        // injected for determinism
  confidenceMin: 0.6,                  // default threshold
  concurrency: 4,                      // default batch cap
  backendTimeoutMs: 30_000,            // per-backend timeout
});

pipeline.addBackend({
  name: 'google',
  type: 'google',                      // tesseract|azure|google|aws|custom
  config: { transport: googleVisionClient },
  languages: ['heb', 'eng'],
  priority: 10,
});

pipeline.fallbackOrder({ primary: 'google', secondary: 'azure', tertiary: 'tesseract' });
pipeline.confidenceThreshold({ min: 0.75 });

const result = await pipeline.processDocument({
  file: imageBuffer,
  hints: { language: 'heb', docType: 'invoice', dpi: 300 },
});

const { fields, missing, confidence } = pipeline.structuredExtract({
  text: result.text,
  schema: INVOICE_SCHEMA,
});

const { text, redactions } = pipeline.sensitiveRedact({
  text: result.text,
  patterns: ['israeli-id', 'credit-card'],
});

const zones   = await pipeline.layoutAnalysis(file);
const tables  = await pipeline.tableExtraction(file);
const written = await pipeline.handwritingDetect(file);

const quality = pipeline.qualityCheck({ result, expected: ['invoice', 'total'] });
const results = await pipeline.batchProcess([file1, file2, file3]);
```

## 4. Backend comparison

| Backend | Type slug | Hebrew accuracy | Tables | Handwriting | Cost / call | Latency | When to prefer |
|---|---|---|---|---|---|---|---|
| Tesseract (local) | `tesseract` | Medium (with `heb` trained data) | Basic | Poor | Free | 500 - 2000 ms | Offline / air-gapped, small volume, crisp scans |
| Google Cloud Vision | `google` | **Best** | Good | Good | ~$1.50/1k | 200 - 800 ms | Default production path for Hebrew forms |
| Azure Document Intelligence | `azure` | Good | **Best** (prebuilt invoice / receipt models) | Excellent | ~$10/1k | 500 - 1500 ms | Forms with complex tables, KYC IDs |
| AWS Textract | `aws` | Medium | **Best** (AnalyzeDocument) | Excellent | ~$1.50/1k base, $50/1k tables | 300 - 1200 ms | Heavy tables, signatures, when already on AWS |
| Custom (caller-supplied fn) | `custom` | — | — | — | — | — | Tests, BYO ML, or a GPT-4-Vision transport |

**Recommended Hebrew production wiring:**
1. `google`  (priority 10) — best OCR quality on Hebrew
2. `azure`   (priority  7) — failover + best tables on invoices
3. `tesseract` (priority 1) — offline safety net

`pipeline.fallbackOrder({ primary: 'google', secondary: 'azure', tertiary: 'tesseract' })`.

## 5. Hebrew considerations

### 5.1 Script directionality
Hebrew is RTL while numbers, Latin words, and punctuation are LTR. Mixed
content flips bytes in ways that break naive regex anchoring. We fix this
inside `hebrewNormalize`:

1. `normalize('NFC')` composes niqqud onto base letters so the range strip is
   atomic.
2. Strip Unicode range `U+0591 .. U+05C7` (niqqud / cantillation).
3. Strip Unicode bidi controls `U+200E, U+200F, U+202A-E, U+2066-9`.
4. Fold final letters: `ך→כ`, `ם→מ`, `ן→נ`, `ף→פ`, `ץ→צ`.
5. Collapse runs of spaces / tabs while keeping newlines.

Folding is irreversible on display but enables fuzzy matching — the original
raw text is preserved in `result.raw_text` so the UI still shows the correct
final letters, while downstream regex/lookup runs on the folded form.

### 5.2 Currency
`₪` (U+20AA), `ILS`, `NIS`, `ש"ח`, `ש'ח` all collapse to `ILS` inside the
`invoice` / `receipt` post-processor.

### 5.3 Israeli identifiers
| Field | Hebrew | Pattern | Length |
|---|---|---|---|
| Teudat-zehut (personal ID) | ת.ז | `\d{9}` (or `\d{3}-\d{3}-\d{3}`) | 9 |
| H.P. (company / osek-morshe) | ח"פ / ע.מ | `\d{9}` | 9 |
| Allocation number (רפורמת חשבונית 2024) | מס' הקצאה | `\d{8,10}` | 8-10 |
| Rishiyon-esek (business license) | רישיון עסק | Alphanumeric | varies |
| Mill heat number | מס' היתוך / Heat No. | Alphanumeric | varies |

All five are first-class supported in `SUPPORTED_DOC_TYPES`.

### 5.4 Mixed-script numbers
We normalise digit runs inside the invoice post-processor to fix common
OCR confusions:

- `(?<=\d)O(?=\d) → 0` — O zero collision
- `(?<=\d)l(?=\d) → 1` — lower-L / one collision
- `1,250.00 → 1250.00` — drop thousands separator so JS `Number()` parses

### 5.5 Niqqud in the wild
Niqqud is rare on invoices (appears on religious documents, textbooks,
children's books). Mill certificates, teudat-zehut scans, and rishiyon-esek
licenses do occasionally include it; all are handled.

## 6. Schemas (ready-to-paste)

### 6.1 Israeli tax invoice
```js
const INVOICE_SCHEMA = {
  invoice_number: {
    type: 'string',
    pattern: /(?:Invoice No|Invoice #|מספר חשבונית)[:\s]*([\w\/-]+)/i,
    required: true,
  },
  invoice_date: {
    type: 'date',
    pattern: /(?:Date|תאריך)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
    required: true,
  },
  supplier_company_id: {
    type: 'id',
    pattern: /(?:ח["']?פ|ע[."']?מ|VAT ID)[:\s]*(\d{9})/i,
    required: true,
  },
  allocation_number: {
    type: 'string',
    pattern: /(?:מס['"]?\s*הקצאה|Allocation)[:\s]*(\d{8,10})/i,
  },
  subtotal: {
    type: 'number',
    pattern: /(?:Subtotal|סה["']?כ לפני מע["']?מ)[:\s]*([\d.,]+)/i,
  },
  vat_amount: {
    type: 'number',
    pattern: /(?:VAT|מע["']?מ)[:\s]*([\d.,]+)/i,
  },
  total: {
    type: 'number',
    pattern: /(?:Total|סה["']?כ לתשלום|סה["']?כ כולל)[:\s]*([\d.,]+)/i,
    required: true,
  },
};
```

### 6.2 Teudat-zehut (ID card)
```js
const TEUDAT_ZEHUT_SCHEMA = {
  id_number: {
    type: 'id',
    pattern: /(?:ת["']?ז|ID)[:\s]*(\d{9})/i,
    required: true,
  },
  last_name: {
    type: 'string',
    pattern: /(?:Last|משפחה)[:\s]*([\p{L}'" -]+)/iu,
  },
  first_name: {
    type: 'string',
    pattern: /(?:First|פרטי)[:\s]*([\p{L}'" -]+)/iu,
  },
  date_of_birth: {
    type: 'date',
    pattern: /(?:DOB|לידה)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  },
};
```

### 6.3 Rishiyon-esek (business licence)
```js
const RISHIYON_ESEK_SCHEMA = {
  license_number: {
    type: 'string',
    pattern: /(?:License|מס['"]?\s*רישיון)[:\s]*(\w[\w\/-]+)/i,
    required: true,
  },
  business_name: {
    type: 'string',
    pattern: /(?:שם העסק|Business Name)[:\s]*([\p{L}\p{N}'" -]+)/iu,
  },
  issued_at: {
    type: 'date',
    pattern: /(?:Issued|הונפק)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  },
  expires_at: {
    type: 'date',
    pattern: /(?:Expires|בתוקף עד)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  },
};
```

### 6.4 Mill certificate (תעודת ייצור)
```js
const MILL_CERT_SCHEMA = {
  heat_number: { type: 'string', pattern: /Heat No\.?\s*([\w-]+)/i, required: true },
  grade:       { type: 'string', pattern: /Grade\s*([\w-]+)/i },
  standard:    { type: 'string', pattern: /(?:Standard|תקן)[:\s]*([\w\/-]+)/i },
  tensile:     { type: 'number', pattern: /(?:Tensile|קשיחות)\s*([\d.]+)/i },
};
```

## 7. Redaction patterns shipped by default

| Slug | Catches | Example input | Example output |
|---|---|---|---|
| `israeli-id` | 9-digit ID, grouped or not | `ת.ז 123456789` | `ת.ז [REDACTED]` |
| `credit-card` | 13-19 digit PAN, any grouping | `4580-1234-5678-9012` | `[REDACTED]` |
| `iban-il` | IL-prefixed 21-char IBAN | `IL620108000000099999999` | `[REDACTED]` |
| `email` | Generic RFC-ish email | `kobi@example.co.il` | `[REDACTED]` |
| `il-phone` | Mobile + landline, with/without `+972` | `054-123-4567` | `[REDACTED]` |

Custom patterns are accepted either as an array of slugs (subset of the
defaults) **or** as a `{ slug: RegExp }` map that the caller fully controls.
The function returns a per-pattern count so the caller can audit how much PII
was scrubbed.

## 8. Error codes

| Code | Raised by | Meaning |
|---|---|---|
| `OCR_BACKEND_NAME_REQUIRED` | `addBackend` | `name` missing / not a string |
| `OCR_BACKEND_TYPE_UNSUPPORTED` | `addBackend` | `type` not in the five allowed |
| `OCR_BACKEND_LANG_REQUIRED` | `addBackend` | `languages` is empty / wrong shape |
| `OCR_LANGUAGE_UNSUPPORTED` | `addBackend`, `processDocument` | `language` outside `heb / eng / auto` |
| `OCR_BACKEND_PRIORITY_INVALID` | `addBackend` | `priority` not a number |
| `OCR_BACKEND_NOT_REGISTERED` | `fallbackOrder` | unknown backend name |
| `OCR_CONFIDENCE_INVALID` | `confidenceThreshold` | `min` not in `[0,1]` |
| `OCR_FILE_REQUIRED` | `processDocument`, layout/tables/handwriting | `file` is null |
| `OCR_DOC_TYPE_UNSUPPORTED` | `postProcessing`, `processDocument` | unknown docType |
| `OCR_NO_BACKEND_AVAILABLE` | `processDocument` | no backend covers the language |
| `OCR_BACKEND_TRANSPORT_MISSING` | `_invokeBackend` | transport function not injected |
| `OCR_BACKEND_TIMEOUT` | `_invokeBackend` | backend exceeded `backendTimeoutMs` |
| `OCR_BACKEND_RESULT_INVALID` | `_normalizeBackendResult` | non-object returned |
| `OCR_CONFIDENCE_TOO_LOW` | `processDocument` | result below `confidenceMin` |
| `OCR_ALL_BACKENDS_FAILED` | `processDocument` | every route step failed |
| `OCR_TEXT_REQUIRED` | `structuredExtract`, `sensitiveRedact` | `text` missing |
| `OCR_SCHEMA_REQUIRED` | `structuredExtract` | `schema` missing |
| `OCR_REDACT_PATTERN_UNKNOWN` | `sensitiveRedact` | unknown slug |
| `OCR_REDACT_PATTERN_INVALID` | `sensitiveRedact` | bad patterns input shape |
| `OCR_BATCH_INPUT_INVALID` | `batchProcess` | files is not an array |

## 9. Test coverage

```
$ node --test test/documents/ocr-pipeline.test.js
ℹ tests 39
ℹ pass 39
ℹ fail 0
```

**Test groups:**

1. Module surface — exports, constants (1 test)
2. `addBackend` validation — type, name, language, priority, storage (4)
3. Backend routing — priority, language filter, empty-route error (3)
4. `fallbackOrder` — ordered cascade, all-fail combined error, unknown name (3)
5. `confidenceThreshold` — low-confidence cascade, input validation, 0..100 scale (3)
6. Hebrew normalisation — niqqud, final letters, bidi, null/empty, whitespace, end-to-end (6)
7. Sensitive redaction — Israeli ID, credit card, unknown slug, custom map, phone (5)
8. `postProcessing` — currency, unknown doc type, general no-op (3)
9. `structuredExtract` — by pattern, missing required (2)
10. Layout / tables / handwriting — delegation, fallback zone (4)
11. `batchProcess` — in-order success, per-file isolation (2)
12. `qualityCheck` — missing field, healthy pass (2)
13. Metrics — fallback hops, per-backend counts (1)

**Required by spec — all covered:**
- [x] Backend routing
- [x] Fallback order
- [x] Confidence threshold
- [x] Hebrew normalization
- [x] Sensitive redaction

## 10. Hebrew glossary

| Hebrew | Transliteration | English |
|---|---|---|
| חשבונית מס | hesbonit mas | tax invoice |
| חשבונית מס-קבלה | hesbonit mas-kabala | tax-invoice-receipt |
| חשבונית זיכוי | hesbonit zikuy | credit note |
| חשבונית עסקה | hesbonit iska | proforma invoice |
| קבלה | kabala | receipt |
| מע"מ | ma'am | VAT |
| סה"כ לתשלום | sakh hakol letashlum | total due |
| מס' הקצאה | mispar hatzaa | allocation number (2024 reform) |
| ח"פ | het-pe | company / VAT ID |
| ת.ז | teudat zehut | personal identity number |
| ע.מ | ayin-mem | licensed dealer (osek morshe) |
| רישיון עסק | rishiyon esek | business licence |
| תעודת ייצור | teudat yitzur | mill / production certificate |
| מס' היתוך | mispar hitukh | heat number |
| ניקוד | niqqud | vowel marks |
| אותיות סופיות | otiyot sofiyot | final letters (ך ם ן ף ץ) |
| ש"ח | shekel hadash | new Israeli shekel (ILS) |
| שטר / שובר | shtar / shover | voucher |
| חותמת | hotemet | stamp / seal |
| חתימה | hatima | signature |
| חותמת רו"ח | hotemet rahash | CPA stamp |

## 11. Example wiring (to be placed in `onyx-procurement/server.js`)

```js
const vision = require('@google-cloud/vision');
const { OCRPipeline } = require('./src/documents/ocr-pipeline');

const visionClient = new vision.ImageAnnotatorClient();
const googleTransport = async (file) => {
  const [result] = await visionClient.documentTextDetection(file);
  const annotation = result.fullTextAnnotation || { text: '', pages: [] };
  // Google confidence is 0..1 already.
  const confidence = annotation.pages.length
    ? annotation.pages.reduce((acc, p) => acc + (p.confidence || 0), 0) / annotation.pages.length
    : 0;
  return { text: annotation.text, confidence, language: 'auto' };
};

const pipeline = new OCRPipeline({ confidenceMin: 0.7, concurrency: 6 });

pipeline.addBackend({
  name: 'google',
  type: 'google',
  config: { transport: googleTransport },
  languages: ['heb', 'eng', 'auto'],
  priority: 10,
});

// tesseract + azure wired similarly...

pipeline.fallbackOrder({ primary: 'google', secondary: 'azure', tertiary: 'tesseract' });

module.exports = { pipeline };
```

## 12. Rule compliance

- **No files deleted.** Only new files created:
  - `onyx-procurement/src/documents/ocr-pipeline.js`
  - `onyx-procurement/test/documents/ocr-pipeline.test.js`
  - `_qa-reports/AG-Y111-ocr-pipeline.md`
- **Zero external dependencies in core** — only Node built-ins.
- **All backends are mockable** via `config.transport` injection; tests run
  with plain async functions and `node:test`.
- **Existing modules untouched** — no edits to `src/ocr/invoice-ocr.js`
  (which is a sibling, not a replacement). The two modules are complementary:
  `invoice-ocr.js` is the Israeli-invoice-specific scanner; `ocr-pipeline.js`
  is the generic orchestrator that can route to `invoice-ocr.js` as one of
  its custom backends if desired.

## 13. Next steps (not done here — follow-ups)

1. Wire real SDK transports in `onyx-procurement/server.js` behind env vars.
2. Add HTTP route `POST /api/ocr/process` that wraps `pipeline.processDocument`.
3. Plug the pipeline into `src/imports/pdf-invoice-parser.js` so scanned PDFs
   flow through pipeline → parser → staging table.
4. Add a Prometheus exporter around `pipeline.getMetrics()`.
5. Hebrew acceptance tests against real fixture images (requires a
   `fixtures/ocr/` folder; not shipped today to keep this agent zero-dep).
