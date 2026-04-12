# OCR Invoice Scanner — סורק חשבוניות חכם

**Module:** `src/ocr/invoice-ocr.js`
**Tests:** `src/ocr/invoice-ocr.test.js` — 67 passing
**Wave:** 1.5 — Agent 88 — 2026-04-11

Pluggable OCR pipeline for Israeli tax documents. This module is a
STUB: it defines the integration contract, the normalizer, the
validator and the Express routes, and ships a `mock` backend that
returns canned Hebrew invoice fixtures so the rest of the
procurement pipeline can be wired, tested and audited end-to-end
without any OCR vendor dependency.

Real vendor backends (tesseract.js, Google Cloud Vision, Azure
Document Intelligence, GPT-4 Vision) are wired by replacing the
body of the corresponding `backendX` function in the file. The
outer contract (`scanInvoice` → normalized invoice object) does
not change.

---

## 1. Why a stub?

Production OCR against Hebrew tax invoices is hard:

- **RTL** text direction mixed with LTR numbers, dates and
  English product names.
- **Hebrew fonts** — Stam / David / Arial Hebrew / Narkisim — each
  has its own ligature quirks.
- **Document types** — there are five legal variants (חשבונית מס,
  חשבונית מס-קבלה, חשבונית זיכוי, חשבונית עסקה, קבלה) and the
  parser must decide which one it is looking at.
- **רפורמת חשבונית 2024** added a mandatory מספר הקצאה
  (allocation number) for high-value invoices.
- **Vendor lock-in risk** — committing to one OCR provider before
  a user study is a regret pattern.

The stub lets the downstream pipeline (AP matching, VAT posting,
audit trail, DB persistence) develop in parallel with the vendor
integration. Every downstream test can use the `mock` backend.

---

## 2. Supported backends

Selected by the `OCR_BACKEND` environment variable or the `backend`
option on `scanInvoice()`.

| Backend                  | Status | Env var / deps                                  |
|--------------------------|--------|-------------------------------------------------|
| `mock` *(default)*       | ready  | none — returns deterministic fixtures           |
| `tesseract`              | stub   | `tesseract.js` / `node-tesseract` (`heb+eng`)   |
| `google-vision`          | stub   | `@google-cloud/vision`, `GOOGLE_APPLICATION_CREDENTIALS` |
| `azure-form-recognizer`  | stub   | `@azure/ai-form-recognizer`, `AZURE_FR_ENDPOINT`, `AZURE_FR_KEY` |
| `openai-vision`          | stub   | `openai`, `OPENAI_API_KEY`, model `gpt-4-vision-preview` |

All stubs throw `OcrError` with `code: 'OCR_BACKEND_NOT_INSTALLED'`
and return HTTP 501 through the route handler, so production
operators get an unambiguous signal about what's missing.

Unknown backend names throw `code: 'OCR_BACKEND_UNSUPPORTED'` and
return HTTP 400.

---

## 3. Public API

```js
const {
  scanInvoice,
  validateInvoice,
  detectInvoiceType,
  extractCompanyId,
  extractAllocationNumber,
  registerOcrRoutes,
  OcrError,
  SUPPORTED_BACKENDS,
} = require('./src/ocr/invoice-ocr');
```

### `scanInvoice(buffer, opts?)`

```js
const invoice = await scanInvoice(pdfBuffer, {
  backend: 'mock',            // optional override of OCR_BACKEND
  hint:    { fixture: 'credit_note' }, // mock-only steering
});
```

Returns a normalized invoice object (see section 4). Throws
`OcrError` on backend / config failure.

### `validateInvoice(invoice)`

```js
const { valid, errors, warnings } = validateInvoice(invoice);
```

Enforces the business rules from section 5.

### `registerOcrRoutes(app, { supabase, audit })`

Wires two Express routes:

- `POST /api/ocr/invoice` — base64 upload → structured data.
- `POST /api/ocr/invoice/verify` — human-verified save to DB
  (table `ocr_scanned_invoices`).

---

## 4. Output shape

```js
{
  supplier: {
    name:        'טכנו-קול עוזי בע"מ',
    company_id:  '514321987',          // 9-digit ח"פ, dashes stripped
    address:     'רחוב התעשייה 12, תל אביב',
    phone:       '03-5551234',
  },
  invoice: {
    number:            'INV-2026-000088',
    date:              '2026-04-11',   // ISO 8601
    type:              'invoice',      // see §6
    allocation_number: 'AL202604110088',
    total_before_vat:  1030.00,
    vat_rate:          0.17,
    vat_amount:        175.10,
    total_with_vat:    1205.10,
    currency:          'ILS',
  },
  line_items: [
    { description: 'כבל חשמל 2.5 מ"מ', quantity: 10, unit_price: 25.00, total: 250.00 },
    { description: 'ממסר LS תלת-פאזי',  quantity: 2,  unit_price: 150.00, total: 300.00 },
    { description: 'שעות עבודה',        quantity: 4,  unit_price: 120.00, total: 480.00 },
  ],
  payment_terms: 'שוטף + 30',
  due_date:      '2026-05-11',
  raw_text:      '…full OCR text…',
  confidence:    0.92,               // 0..1
  backend:       'mock',
  scanned_at:    '2026-04-11T09:31:07.123Z',
}
```

---

## 5. Validation rules

| Rule                                                              | Severity | Code / message                                       |
|-------------------------------------------------------------------|----------|------------------------------------------------------|
| Invoice number, date, type must be present                        | error    | `"… missing"`                                        |
| Supplier `company_id` must be a valid 9-digit ח"פ (if present)    | error    | `"Supplier company_id … is not a valid 9-digit ח"פ"` |
| Invoice date must be in the past 10 years or ≤ 1 year ahead       | error    | `"Invoice date … is outside the sane range"`         |
| `total_before_vat × (1 + vat_rate) ≈ total_with_vat (±2 agorot)`  | error    | `"VAT totals mismatch …"`                            |
| Tax invoice > ILS 25,000 with no allocation number               | warning  | `"… רפורמת חשבונית 2024"`                             |
| `confidence < 0.5`                                                | warning  | `"Low OCR confidence … manual review recommended"`   |
| Supplier `company_id` missing                                     | warning  | `"… cannot verify against רשות המיסים"`              |
| Totals incomplete                                                 | warning  | `"Totals incomplete — cannot reconcile VAT"`         |

The VAT rounding tolerance is `VAT_ROUNDING_TOLERANCE = 0.02`
(2 agorot). Standard rate is `VAT_RATE_STANDARD = 0.17` (17%).

---

## 6. Invoice type detection

Keyword matching, most specific first (so `חשבונית מס-קבלה`
beats the shorter `חשבונית מס`):

| Type              | Hebrew keywords                                           |
|-------------------|-----------------------------------------------------------|
| `invoice_receipt` | חשבונית מס-קבלה, חשבונית מס קבלה, מס קבלה, מס-קבלה        |
| `credit_note`     | חשבונית זיכוי, תעודת זיכוי, זיכוי                         |
| `proforma`        | חשבונית עסקה, חשבון עסקה, פרופורמה                         |
| `invoice`         | חשבונית מס, tax invoice, חשבונית                           |
| `receipt`         | קבלה, receipt                                              |

Default is `invoice` when nothing matches.

---

## 7. Regex cheat sheet

| Field                 | Strategy                                                              |
|-----------------------|-----------------------------------------------------------------------|
| Company ID (ח"פ / ת.ז) | Labelled scan (`ח.פ.`, `ח"פ`, `ע.מ.`, `ת.ז`) → unlabelled 9-digit fallback. Dashes/spaces stripped; must collapse to exactly 9 digits. |
| Allocation number     | `AL` or `מספר הקצאה` followed by 6-12 letters/digits.                 |
| Invoice number        | Labelled (`מספר חשבונית:`) → free-standing `XXX-YYYY-NNN` fallback.   |
| Date                  | Prefers `תאריך: DD/MM/YYYY`; falls back to any DD/MM/YYYY token. Rejects out-of-range day/month/year. |
| Due date              | `מועד תשלום / due date: DD/MM/YYYY`.                                  |
| Payment terms         | `תנאי תשלום: …` or free-standing `שוטף +/+ NN` / `net NN`.            |
| Currency              | `₪` / `ש"ח` / `NIS` / `ILS` → `ILS`; `$` / `USD` → `USD`; `€` / `EUR` → `EUR`. Default `ILS`. |
| Totals                | Three dedicated regexes (`לפני מע"מ`, `מע"מ NN%`, `סה"כ לתשלום/כולל/זיכוי`). The VAT regex *requires* an explicit percentage so it doesn't accidentally match `לפני מע"מ`. |
| Line items            | 3-number tail pattern `description qty unit total`. Header rows and totals lines are filtered out. |
| Supplier              | First non-title, non-ID, non-date line under 60 chars → name. Phone / address have dedicated regexes. |

---

## 8. HTTP API

### `POST /api/ocr/invoice`

**Request**
```json
{
  "file": "<base64 PDF or image>",
  "mime": "application/pdf",
  "hint": { "fixture": "default" }
}
```

**Success 200**
```json
{
  "ok": true,
  "mime": "application/pdf",
  "backend": "mock",
  "invoice": { "supplier": { ... }, "invoice": { ... }, "line_items": [ ... ], ... },
  "validation": { "valid": true, "errors": [], "warnings": [] }
}
```

**Errors**
- `400` `{ ok: false, code: "OCR_NO_FILE" }` — missing `file`.
- `400` `{ ok: false, code: "OCR_BACKEND_UNSUPPORTED" }` — unknown backend.
- `501` `{ ok: false, code: "OCR_BACKEND_NOT_INSTALLED", backend: "tesseract" }` — vendor SDK not wired.

### `POST /api/ocr/invoice/verify`

Used by the human-in-the-loop UI. Accepts the OCR output plus
optional field-by-field `corrections`, re-runs `validateInvoice`
and, if a `supabase` client is wired through `registerOcrRoutes`,
upserts a row into `ocr_scanned_invoices` and emits an audit
entry.

**Request**
```json
{
  "invoice":     { /* from POST /api/ocr/invoice */ },
  "corrections": {
    "supplier": { "name": "Corrected Name Ltd" },
    "invoice":  { "number": "INV-CORRECTED" }
  },
  "actor": "kobi"
}
```

**Success 201** (when persisted)
```json
{
  "ok": true,
  "invoice":    { "id": "row-1", ... },
  "validation": { "valid": true, "errors": [], "warnings": [] }
}
```

**Success 200** (no supabase wired, or validation failures surfaced)
```json
{
  "ok": true,
  "invoice":    { "verified": true, "verified_by": "kobi", "verified_at": "…", ... },
  "validation": { ... },
  "saved":      false
}
```

---

## 9. Expected DB schema — `ocr_scanned_invoices`

The verify route writes these columns; add a migration before
enabling the real Supabase wiring:

| Column              | Type              | Notes                              |
|---------------------|-------------------|------------------------------------|
| `id`                | uuid (pk)         | default `gen_random_uuid()`        |
| `supplier_name`     | text              |                                    |
| `supplier_cid`      | text              | 9-digit ח"פ                         |
| `invoice_number`    | text              |                                    |
| `invoice_date`      | date              |                                    |
| `invoice_type`      | text              | one of §6 types                    |
| `total_before_vat`  | numeric(12,2)     |                                    |
| `vat_amount`        | numeric(12,2)     |                                    |
| `total_with_vat`    | numeric(12,2)     |                                    |
| `currency`          | text              | default `'ILS'`                    |
| `allocation_number` | text              | nullable, רפורמת 2024               |
| `raw_text`          | text              |                                    |
| `confidence`        | numeric(4,3)      | 0..1                               |
| `backend`           | text              |                                    |
| `line_items`        | jsonb             |                                    |
| `verified_by`       | text              |                                    |
| `verified_at`       | timestamptz       |                                    |
| `created_at`        | timestamptz       | default `now()`                    |

---

## 10. Wiring a real backend

1. `npm i <vendor-sdk>` in `onyx-procurement`.
2. Replace the body of the relevant `backendX` function in
   `src/ocr/invoice-ocr.js`. Keep the return shape:
   ```js
   { raw_text: string, confidence: number /* 0..1 */, meta: object }
   ```
3. Set the env var, e.g. `OCR_BACKEND=tesseract`.
4. Run `node --test src/ocr/invoice-ocr.test.js` — the mock-backend
   tests remain the canonical contract.

---

## 11. Running the tests

```bash
# module-level
node --test src/ocr/invoice-ocr.test.js

# full suite (picked up by the /tests directory runner)
npm test
```

67 tests cover backend registry, type detection, ח"פ / allocation
extraction, date / due-date / currency / totals / line-items /
supplier extractors, normalizer shape, validator rules and the
Express routes (smoke tests against a fake app + fake Supabase).
