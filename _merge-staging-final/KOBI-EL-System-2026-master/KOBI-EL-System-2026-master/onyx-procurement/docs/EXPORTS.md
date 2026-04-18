# ONYX — Excel / XLSX Exports

Agent 66 — written 2026-04-11

ONYX now ships a zero-dependency XLSX exporter plus streaming HTTP
routes for every major entity (employees, wage slips, invoices,
suppliers, PCN 836 payroll reports, bank transactions). No third-party
libraries are pulled in — the exporter builds Office Open XML files
from scratch on top of Node's built-in `zlib`.

---

## Why zero dependencies

The Israeli payroll / procurement stack already runs close to the
bone. Adding an XLSX writer like `exceljs` or `xlsx-populate` would:

* pull in megabytes of transitive dependencies,
* slow cold-start for Lambda / container deploys,
* introduce CVEs outside of ONYX's direct supply chain,
* and make RTL / Hebrew text unpredictable across library versions.

Instead, `src/exports/excel-exporter.js` speaks SpreadsheetML directly
and assembles a PKZip 2.0 archive inline. Only `node:zlib` is required.

---

## File layout

```
src/exports/
  excel-exporter.js       ← core XLSX builder (pure functions, no I/O required)
  export-routes.js        ← Express route factory, streams XLSX to res
test/
  excel-exporter.test.js  ← ZIP parser + structural + Hebrew round-trip tests
docs/
  EXPORTS.md              ← you are here
```

---

## Core API — `excel-exporter.js`

### `exportToExcel(rows, options)`

| option       | type                   | default       | description |
|--------------|------------------------|---------------|-------------|
| `sheetName`  | string                 | `'גיליון1'`   | Shown on the workbook tab. Truncated to 31 chars (Excel limit). |
| `headers`    | Array\<HeaderDef\>     | auto from `rows[0]` | Columns. See table below. |
| `rtl`        | boolean                | `true`        | Adds `rightToLeft="1"` to the sheet view. |
| `outputPath` | string                 | –             | If set, writes the buffer to disk. Parent directories are created. |
| `stream`     | WritableStream         | –             | If set, the buffer is written via `stream.end(buf)`. Use this for `res`. |
| `styles`     | object                 | `{}`          | Fine-tunes styles.xml. See below. |
| `merges`     | Array\<MergeDef\>      | `[]`          | Emits `<mergeCells>`. |

Returns a `Buffer` containing the full `.xlsx` regardless of whether
`outputPath` / `stream` were passed — callers can always inspect or
cache the bytes.

#### `HeaderDef`

```js
{
  key:    'employee_number',   // row[key] → cell value
  label:  'מס׳ עובד',           // header text (Hebrew OK)
  format: 'text',               // 'text' | 'number' | 'currency' | 'date'
  width:  14,                   // column width (optional, default 16)
}
```

#### `MergeDef`

```js
{ from: 'A1', to: 'C1' }        // or: { ref: 'A1:C1' }
```

#### `styles` object

| key          | default         | effect |
|--------------|-----------------|--------|
| `headerFill` | `'FFD9E1F2'`    | ARGB fill for the header row. |
| `headerFont` | `'Arial Hebrew'`| Font family; Excel falls back to Calibri on systems without the face. |

### Cell formats

| format     | Excel numFmt          | applied when |
|------------|-----------------------|--------------|
| `text`     | built-in 49 (`@`)     | default — value goes to `sharedStrings.xml` |
| `number`   | custom 164 — `#,##0.00` | `Number(value)` is finite |
| `currency` | custom 165 — `₪#,##0.00` | `Number(value)` is finite |
| `date`     | custom 166 — `dd/mm/yyyy` | value parses to a real date (ISO `YYYY-MM-DD` is the fast path) |

Hebrew strings are stored via `sharedStrings.xml` with proper XML
escaping (`&`, `<`, `>`, `'`, `"`) and C0 control-character stripping.
ISO date-only strings are converted to integer Excel serials to
avoid timezone drift.

### Entity helpers

Each helper wraps `exportToExcel` with a Hebrew sheet name and a
predefined column set that matches the Supabase schemas in
`src/payroll`, `src/bank`, `src/tax`, and `src/vat`.

```js
const {
  exportEmployees,
  exportWageSlips,
  exportInvoices,
  exportSuppliers,
  exportPCN836,
  exportBankTransactions,
} = require('../src/exports/excel-exporter');

// Write to disk
exportEmployees(rows, '/tmp/employees.xlsx');

// Stream to HTTP response
exportWageSlips(rows, res);

// Get the raw buffer
const buf = exportInvoices(rows);
```

The second argument to every helper is polymorphic:

| passed            | behaviour                              |
|-------------------|----------------------------------------|
| `string`          | writes `.xlsx` to that path            |
| writable stream   | calls `stream.end(buffer)`             |
| `undefined`       | buffer is returned only                |

---

## HTTP API — `export-routes.js`

### Mounting

```js
const { registerExportRoutes } = require('./src/exports/export-routes');

registerExportRoutes(app, {
  supabase,         // optional — default fetchers read from Supabase
  fetchers: {},     // optional — override per-entity loaders for tests
  logger: console,  // optional
});
```

All routes are mounted under `/api/exports/*`, which means they
automatically inherit `server.js`'s X-API-Key middleware
(`requireAuth`) — no extra glue is needed.

### Endpoints

| method | path                                             | query params             |
|--------|--------------------------------------------------|--------------------------|
| GET    | `/api/exports`                                   | –                        |
| GET    | `/api/exports/employees.xlsx`                    | –                        |
| GET    | `/api/exports/wage-slips.xlsx`                   | `year`, `month`          |
| GET    | `/api/exports/invoices.xlsx`                     | `from`, `to` (YYYY-MM-DD)|
| GET    | `/api/exports/suppliers.xlsx`                    | –                        |
| GET    | `/api/exports/pcn836.xlsx`                       | `year`, `month`          |
| GET    | `/api/exports/bank-transactions.xlsx`            | `from`, `to` (YYYY-MM-DD)|

`GET /api/exports` returns a JSON discovery payload describing all
other exports, so dashboards can build their Download menu automatically.

### Headers on every .xlsx response

```
Content-Type:        application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="onyx-employees-2026-04-11.xlsx";
                     filename*=UTF-8''onyx-employees-2026-04-11.xlsx
Cache-Control:       no-store
X-Content-Type-Options: nosniff
```

Filenames use RFC 5987 encoding so Hebrew characters survive all
modern browsers (`filename*` parameter) while legacy clients still
get an ASCII fallback.

### Streaming behaviour

The route handlers load rows via a fetcher, then call the entity
helper with `res` as the destination. The helper serialises the
workbook into a single `Buffer` and flushes it via `res.end(buffer)`
— no intermediate temp files touch disk. This is adequate for the
dataset sizes ONYX deals with (tens of thousands of rows). If
hundred-million-row exports ever become a requirement, the inner
`sheet1.xml` assembly can be converted to a row iterator without
changing the outer API.

### Example calls

```bash
curl -H 'X-API-Key: $API_KEY' \
     -o employees.xlsx \
     https://onyx.example.com/api/exports/employees.xlsx

curl -H 'X-API-Key: $API_KEY' \
     -o march-wage-slips.xlsx \
     'https://onyx.example.com/api/exports/wage-slips.xlsx?year=2026&month=3'

curl -H 'X-API-Key: $API_KEY' \
     -o q1-invoices.xlsx \
     'https://onyx.example.com/api/exports/invoices.xlsx?from=2026-01-01&to=2026-03-31'
```

---

## Tests — `test/excel-exporter.test.js`

The test file re-implements a minimal ZIP reader on top of
`zlib.inflateRawSync` so we can open an `.xlsx` **without** shelling
out to `unzip`. That keeps the suite runnable on any stock Node 20+
box, on macOS, Linux, and Windows alike.

Covered:

* `xmlEscape` entity encoding + control-char stripping
* `colLetter` (1 → A … 703 → AAA)
* `toExcelDateSerial` for canonical dates
* `crc32` pinned against well-known PKZip values (CRC of `123456789`)
* Round-trip through the in-test ZIP reader
* Every mandatory XLSX part (`[Content_Types].xml`, `_rels/.rels`,
  `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/styles.xml`,
  `xl/sharedStrings.xml`, `xl/worksheets/sheet1.xml`)
* `rightToLeft`, frozen-pane, autofilter, column widths
* Style IDs for text / number / currency / date cells
* `merges` option emits `<mergeCells>`
* Every entity helper names its sheet in Hebrew
* Disk + stream writes produce byte-identical output
* Empty-row dataset still yields a valid workbook
* Full Hebrew UTF-8 round-trip through sharedStrings

Run:

```bash
node --test test/excel-exporter.test.js
```

Expected: `tests 16, pass 16, fail 0`.

---

## Interop notes

* **Excel for Mac / Windows** — opens files directly; the Arial
  Hebrew face is picked when installed, otherwise Excel falls back
  to Calibri automatically.
* **LibreOffice Calc** — honours `rightToLeft="1"` and the custom
  currency format. Column widths and freeze panes load cleanly.
* **Google Sheets** — import works; Sheets drops the RTL flag at
  the sheet level but picks it up when the imported file is
  reopened in Excel, so the source of truth remains RTL.
* **Dates** — Excel's 1900 leap-year bug is preserved, so the serial
  matches what Excel itself would store. ISO date-only strings
  (`YYYY-MM-DD`) never drift across timezones.
* **Currency glyph** — the ₪ (U+20AA) character lands directly in
  the numFmt code; Excel renders it with the current font.

---

## Adding a new entity export

1. Add a helper in `excel-exporter.js` modelled on `exportEmployees`.
2. Register a fetcher + route in `export-routes.js`.
3. Extend the `/api/exports` discovery payload.
4. Add a case to `test/excel-exporter.test.js`'s "entity helpers
   produce valid .xlsx" block.

That's it — no style-sheet, numFmt, or ZIP plumbing to touch.
