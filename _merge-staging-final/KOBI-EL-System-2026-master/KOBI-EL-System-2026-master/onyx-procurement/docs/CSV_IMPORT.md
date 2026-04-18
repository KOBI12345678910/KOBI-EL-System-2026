# CSV Import Wizard — ONYX Procurement

Module: `src/imports/csv-import.js`
Routes: `src/imports/csv-import-routes.js`
Tests:  `src/imports/csv-import.test.js`
Agent:  **Agent 67** (Wave 2)

The CSV Import Wizard is the canonical bulk-ingestion pipeline for ONYX. It
parses uploaded CSVs, auto-detects delimiters/encodings, fuzzy-maps headers
to our schema, validates every row, and writes accepted rows to Supabase in
batches — **never deleting anything**.

---

## 1. Pipeline overview

```
            ┌────────────┐   ┌──────────────┐   ┌───────────────┐
upload ──▶  │  parseCSV  ├──▶│ mapColumns   ├──▶│ validateRows  │
            └────────────┘   └──────────────┘   └──────┬────────┘
                                                        │
                                                        ▼
                                                  ┌───────────┐
                                                  │ importRows│  (batches of 100)
                                                  └─────┬─────┘
                                                        ▼
                                                 ┌────────────┐
                                                 │importReport│
                                                 └────────────┘
```

Every stage is independent — you can use `parseCSV` on its own, or chain
`validateRows` on an existing in-memory array of objects.

---

## 2. Supported entities

| Entity              | Table              | Required fields |
|---------------------|--------------------|-----------------|
| `employees`         | `employees`        | `employee_number`, `first_name`, `last_name` |
| `suppliers`         | `suppliers`        | `name`, `tax_id` |
| `invoices`          | `invoices`         | `invoice_number`, `supplier_tax_id`, `invoice_date`, `amount_net`, `amount_total` |
| `bank_transactions` | `bank_transactions`| `transaction_date`, `description`, `amount` |

Each field declares:
- `type`       — `string | number | date | boolean | email | phone`
- `required`   — must be present
- `unique`     — in-file uniqueness check (no DB round-trip)
- `checksum`   — `israeli_id` triggers the Hebrew ID/ח.פ checksum
- `minValue`, `maxValue`   — numeric bounds
- `minDate`, `maxDate`     — ISO-8601 bounds
- `aliases[]` — known header names in Hebrew / English for fuzzy mapping
- `default`   — value substituted when the column is empty

Full dictionary: `TARGET_SCHEMAS` in `csv-import.js`.

---

## 3. Core API

```js
const {
  parseCSV,
  autoDetectDelimiter,
  autoDetectEncoding,
  inferSchema,
  mapColumns,
  validateRows,
  importRows,
  importReport,
} = require('./src/imports/csv-import');
```

### `parseCSV(content, opts?)`

Hand-rolled RFC-4180 parser. Accepts a `string` **or** a `Buffer`.

```js
const { headers, rows, meta } = parseCSV(buffer, {
  delimiter: 'auto',      // ',' | ';' | '\t' | '|' | 'auto'
  encoding:  'auto',      // 'utf8' | 'windows-1255' | 'auto'
  hasHeaders: true,
});
```

Handles:
- quoted fields with embedded commas
- escaped quotes (`""`)
- embedded newlines inside quotes
- CRLF / LF / CR line endings
- UTF-8 BOM stripping
- Windows-1255 → Unicode (full CP1255 table)

### `autoDetectDelimiter(sample)`

Picks the delimiter whose count is most consistent across the first 10
lines. Quote-aware: commas inside quoted fields are not counted.

### `autoDetectEncoding(buffer)`

Tries BOMs first, then validates UTF-8, then falls back to
Windows-1255 when several bytes land in the Hebrew range `0xE0–0xFA`.

### `inferSchema(rows)`

Votes across every cell per column: `number`, `date`, `boolean`, or
`string`. Supports Israeli dates (`dd/mm/yyyy`), ISO dates, and numeric
formats with `,`/`.` thousands separators, currency symbols, and `%`.

### `mapColumns(csvHeaders, entity)`

Fuzzy header matcher using Jaro-Winkler similarity + alias lookup tables.
Returns:

```js
{
  mapping: { "שם פרטי": "first_name", "אימייל": "email", ... },
  unmapped: ["weird_col"],
  missingRequired: ["employee_number"],
  score: 0.83,
}
```

Threshold: ≥ 0.82 JW similarity, or an exact/substring alias match.

### `validateRows(rows, entity, rules)`

Row-level validation pipeline. Enforces required fields, coerces numeric/
date/boolean values, runs the Israeli ID checksum, checks ranges, and
tracks in-file uniqueness.

```js
const { valid, invalid, summary } = validateRows(parsed.rows, 'employees', {
  mapping,                     // from mapColumns
});
// summary: { total, valid, invalid, errorCount }
// invalid: [{ row: 5, errors: ["email: invalid email..."], original: {...} }]
```

### `importRows(validated, opts)`

Supabase insert/upsert in batches of 100 (tunable).

```js
const result = await importRows(valid, {
  tableName:  'employees',
  supabase,
  upsert:     true,
  onConflict: 'employee_number',
  batchSize:  100,
});
// { inserted, failed, batches, errors, startedAt, finishedAt }
```

Never deletes anything. If a single batch fails, the error is recorded but
the remaining batches still run.

### `importReport(result)`

Human-friendly merge of validation + import results.

---

## 4. REST API

Mount from `server.js`:

```js
const { registerCsvImportRoutes } = require('./src/imports/csv-import-routes');
registerCsvImportRoutes(app, { supabase, audit });
```

### `POST /api/imports/csv/upload`

Preview only. Returns parsed headers, inferred types, and a suggested
column mapping. No writes.

**Request**
```json
{
  "entity": "employees",
  "content": "ID עובד,שם פרטי,...\nE001,ישראל,...",
  "delimiter": "auto",
  "encoding":  "auto"
}
```

Binary CSVs can be sent as `{ "content": { "base64": "..." } }` — the
server decodes and runs encoding detection on the bytes.

**Response**
```json
{
  "entity": "employees",
  "parsed": {
    "headers": ["ID עובד","שם פרטי","שם משפחה"],
    "rowCount": 42,
    "sample":  [ ...first 10 rows... ],
    "meta":    { "delimiter": ",", "encoding": "auto" }
  },
  "schema": {
    "inferredTypes":    { "ID עובד": "string", "שכר": "number" },
    "suggestedMapping": { "ID עובד": "employee_number", ... },
    "unmappedHeaders":  [],
    "missingRequired":  [],
    "mappingScore":     1.0
  }
}
```

### `POST /api/imports/csv/validate`

Full validation, still read-only. Returns first 200 row-errors and a
preview of the first 10 valid rows.

### `POST /api/imports/csv/commit`

Validate + import. Returns the run record + final report.

```json
{
  "entity": "suppliers",
  "content": "...",
  "mapping": { "שם ספק": "name", "ח.פ": "tax_id" },
  "upsert": true,
  "onConflict": "tax_id"
}
```

Commit refuses to run if **zero** rows pass validation (422). If some
valid rows exist, they are imported and the report lists the rejected
ones so the user can fix and re-run.

### `GET /api/imports/csv/history?limit=20`

Returns the last N import runs. Reads from the `import_runs` table when
it exists, otherwise from an in-memory ring buffer (max 50 entries).

### `GET /api/imports/csv/entities`

Returns the full field dictionary for every supported entity. Useful for
front-end form generators.

---

## 5. Validation rules at a glance

| Rule                      | Where                         |
|---------------------------|-------------------------------|
| Required field missing    | `def.required && empty`       |
| Type mismatch             | `coerceValue` per-type        |
| Non-negative numbers      | `def.minValue = 0`            |
| Date in range             | `def.minDate` / `def.maxDate` |
| ID / ח.פ checksum         | `def.checksum = 'israeli_id'` |
| Email format              | `def.type = 'email'`          |
| Phone format              | `def.type = 'phone'`          |
| In-file uniqueness        | `def.unique`                  |

The Israeli ID algorithm lives in `validateIsraeliId(id)` and is exported
for reuse by the payroll module.

---

## 6. Encoding notes

Most exports from Israeli banks and government systems still arrive in
**Windows-1255**. `parseCSV` handles this transparently when given a
`Buffer`:

```js
const fs = require('fs');
const buf = fs.readFileSync('statement.csv');
parseCSV(buf); // detects CP1255, decodes, then tokenizes
```

The CP1255 → Unicode map in `csv-import.js` is the full 0x80–0xFF range.
No `iconv-lite` dependency.

---

## 7. Example samples

See `src/imports/samples/`:

- `employees-he.csv`       Hebrew headers, comma delimiter, UTF-8
- `suppliers-mixed.csv`    Hebrew headers, semicolon delimiter, UTF-8
- `invoices-en.csv`        English headers, comma delimiter, UTF-8
- `bank-transactions.csv`  Hebrew headers, comma delimiter, UTF-8

Each sample is deliberately small (≤ 5 rows) so it's easy to diff test
output against. All Israeli IDs in the samples are synthetic but pass
the checksum.

---

## 8. Running tests

```bash
node --test src/imports/csv-import.test.js
```

46 tests cover parser, delimiter/encoding detection, schema inference,
fuzzy column mapping, every validation rule, and the Supabase import
path (via a mock client).

---

## 9. Design rules

1. **Zero runtime deps.** No `iconv-lite`, no `papaparse`, no
   `csv-parse`. Pure Node.
2. **Never delete.** `importRows` only performs `insert`/`upsert`.
   The word `delete` does not appear in the module.
3. **Fail-safe.** Parser errors never throw; they return empty results.
   Supabase errors are captured per-batch so partial imports still
   proceed.
4. **Batch = 100.** Default Supabase batch size. Configurable via
   `batchSize`.
5. **Mapping is data-driven.** Add new entities by extending
   `TARGET_SCHEMAS` — no code changes.
