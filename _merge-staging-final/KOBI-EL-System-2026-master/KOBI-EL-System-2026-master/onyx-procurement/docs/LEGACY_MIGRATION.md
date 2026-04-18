# Legacy Data Migration Guide

**Owner:** Agent-68 — ONYX Procurement
**Module:** `src/imports/legacy-migration.js`
**Status:** Production-ready for dry-run; commit phase requires Supabase schema tables listed below.

---

## 1. Why this exists

Techno-Kol Uzi El has, over the years, run several business systems before migrating to ONYX:

- Unstructured Excel spreadsheets (XLS / XLSX) kept by the office
- **Hashavshevet (חשבשבת)** — the ubiquitous Israeli bookkeeping system, in two dialects:
  - חשבשבת חלונאי (Windows flavour)
  - חשבשבת ERP
- **Priority ERP** — used for inventory, purchase orders, invoicing
- A handful of ad-hoc CSV exports from other systems

This module provides safe, auditable migration from all of them into ONYX's Supabase data store.

The hard rule: **no deletes, ever**. Failed commits are soft-flagged via `migration_status = 'rolled_back'`, never removed. Every run writes an entry to `legacy_migration_audit`.

---

## 2. High-level API

```javascript
const {
  detectLegacySystem,
  migrateLegacyData,
  generateMigrationReport,
  LEGACY_SYSTEMS,
} = require('./src/imports/legacy-migration');

// Step 1 — tell me what the file is
const system = detectLegacySystem({ name: 'export.csv', content: fileBuffer });

// Step 2 — run the pipeline (dry-run first!)
const result = await migrateLegacyData(
  { name: 'export.csv', content: fileBuffer },
  system,
  { supabase, dryRun: true }
);

// Step 3 — print the report
const report = generateMigrationReport(result);
console.log(report.markdown);

// Step 4 — if the dry run looked good, re-run with dryRun: false
```

---

## 3. Supported source systems

| System                  | `LEGACY_SYSTEMS` value   | File hint               | Adapter            |
| ----------------------- | ------------------------ | ----------------------- | ------------------ |
| Excel (any dialect)     | `EXCEL`                  | `.xls` / `.xlsx`        | `parseExcelLegacy` |
| Hashavshevet Windows    | `HASHAVSHEVET_WIN`       | `.csv` + `חשבשבת` marker| `parseHashavshevet`|
| Hashavshevet ERP        | `HASHAVSHEVET_ERP`       | `.csv` + `ERP` / `SQL`  | `parseHashavshevet`|
| Priority ERP            | `PRIORITY`               | `.xml` or `.csv`        | `parsePriority`    |
| Generic fallback        | `GENERIC_CSV`            | any `.csv`              | `parseGenericCsv`  |

### Entity types emitted

- `invoice`, `credit_note` (חו"ש / זיכוי)
- `receipt` (תקבולים)
- `ledger_card` (כרטיסי הנה"ח)
- `inventory_item`, `purchase_order`
- `supplier`, `customer`

Each entity maps to a dedicated `legacy_*` table in Supabase (see §8).

---

## 4. The 7-stage pipeline

```
 [1] parse   → [2] map   → [3] transform → [4] validate
   ↓             ↓             ↓              ↓
 raw rows    canonical     normalized      valid rows
                fields     values          + errors
                                              ↓
                                         [5] dry-run preview
                                              ↓
                                         [6] commit (if !dryRun)
                                              ↓
                                         [7] audit log
                                              ↓
                                    rollback on any error
```

Each stage is pure and independently testable. See the exports at the bottom of `legacy-migration.js` — every stage function is exposed for unit tests.

### Stage details

#### 1. Parse
Each adapter converts the raw file into an array of plain-object rows. Adapters handle:
- Hebrew encoding (CP1255 accepted via pre-decoded text; UTF-8 native)
- Merged cells (Excel — vertical inheritance)
- Formulas (Excel — simple arithmetic `=1000+180` resolved to the number)
- XML entities (Priority)
- Semicolon / comma / tab / pipe delimiters (Hashavshevet + generic CSV)

#### 2. Map
`mapSchema()` uses the `HEADER_ALIAS` dictionary to translate Hebrew or English column headers into canonical field names. Unknown headers are preserved as `extra_<key>` so nothing is lost.

**Adding a new alias:**
```javascript
// edit HEADER_ALIAS in legacy-migration.js
'שם הפריט בעברית': 'item_name',
```

#### 3. Transform
Normalises values in-place:
- **Dates** — `DD/MM/YYYY`, `YYYY-MM-DD`, Excel serial numbers, Hebrew-date detection (refused unless explicitly opted in).
- **Amounts** — strips `₪`, `ש"ח`, commas; `(500)` becomes `-500`.
- **IDs** — zero-pads `tax_id` and `company_id` to 9 digits.
- **Text** — strips RTL/LTR unicode marks.

#### 4. Validate (Israel-specific)
- **ת.ז.** — Luhn-like checksum (same algorithm as the ITA)
- **ח"פ / ע"מ** — 9 digits, same checksum
- **Invoice totals** — `net + vat ≈ gross` with 0.02 ₪ tolerance. If any component is missing, it is derived from the VAT rate (`DEFAULT_VAT_RATE = 0.18` in 2026).
- **Dates** — rejects Hebrew-calendar dates to prevent mis-conversion.
- **Inventory items** — must have either `sku` or `item_name`.

Errors populate `result.errors` with `{ stage, row, field, code }`. Rows that fail validation are excluded from commit but retained in the audit log so they can be re-examined.

#### 5. Dry-run preview
Always runs. Produces `result.stages.dry_run.byEntity` — a histogram of what _would_ be written. Operators always look at the dry run before flipping `dryRun: false`.

#### 6. Commit
Uses the injected Supabase client (`options.supabase`). Rows are grouped by entity and batch-inserted per table. If any insert returns an error, the pipeline calls `rollbackCommit()`, which **soft-flags** already-inserted rows via `UPDATE ... SET migration_status = 'rolled_back'`. Nothing is physically deleted.

#### 7. Audit log
Every run writes one row to `legacy_migration_audit`:
```json
{
  "run_id": "legacymig_lu9x_ab12cd",
  "started_at": "2026-04-11T10:00:00Z",
  "system": "hashavshevet_win",
  "file_name": "exports/2026-q1.csv",
  "counts": { "parsed": 153, "valid": 150, "invalid": 3, "committed": 150 },
  "dry_run": false,
  "stages": { "...": "..." },
  "errors_count": 3
}
```

---

## 5. Israeli validation reference

### ת.ז. / ח"פ / ע"מ checksum

Implemented in `validateIsraeliId()`:
```
For each of the 9 digits:
  d[i] × ((i mod 2) + 1)
  if result > 9, subtract 9
Sum all values; valid when sum mod 10 == 0
```

### Invoice totals

Accepted combinations (with `tolerance = 0.02 ₪`):
- All three present — consistency check `|net + vat - gross| ≤ 0.02`
- Only gross — derives net = `gross / (1 + vatRate)` and vat = remainder
- Only net — derives vat = `net × vatRate` and gross
- Net + gross — derives vat
- Vat + gross — derives net

Override the VAT rate per run via `{ vatRate: 0.17 }` (useful for historical years when the rate was 17%).

### Dates

The pipeline is Gregorian-only. Hebrew-calendar dates (e.g. `כ"ט אדר תשפ"ו`) are detected and flagged as `hebrew_date_unsupported` rather than silently mis-converted. If you genuinely need Hebrew-date support, pass the row through a dedicated Hebrew-calendar converter _before_ `migrateLegacyData`.

---

## 6. Sample files

See `src/imports/legacy-samples/` for a ready-to-migrate fixture set:

| File                         | System                  | Entity           |
| ---------------------------- | ----------------------- | ---------------- |
| `hashavshevet-windows.csv`   | HSB Windows             | invoices         |
| `hashavshevet-erp.csv`       | HSB ERP                 | invoices         |
| `hashavshevet-ledger.csv`    | HSB                     | ledger cards     |
| `hashavshevet-receipts.csv`  | HSB                     | receipts         |
| `priority-invoices.xml`      | Priority                | invoices         |
| `priority-orders.xml`        | Priority                | purchase orders  |
| `priority-parts.csv`         | Priority                | inventory        |
| `excel-legacy.txt`           | Excel (normalized text) | mixed sheets     |
| `generic-mixed.csv`          | Fallback CSV            | invoices         |

Run any of these through a dry migration as a smoke test:
```bash
node -e "
const fs = require('fs');
const path = require('path');
const L = require('./src/imports/legacy-migration');
const file = {
  name: 'hashavshevet-windows.csv',
  content: fs.readFileSync(path.join('src/imports/legacy-samples','hashavshevet-windows.csv'),'utf8')
};
const sys = L.detectLegacySystem(file);
L.migrateLegacyData(file, sys, { dryRun: true }).then(r => {
  console.log(L.generateMigrationReport(r).markdown);
});
"
```

---

## 7. Operator runbook

1. **Collect the source file.** Confirm it is a final export, not a work-in-progress copy.
2. **Sanity-check encoding.** If the file is `windows-1255`, decode it to UTF-8 first (`iconv-lite` or the export-side "Save as UTF-8" option).
3. **Run a dry migration.** Always. Look at:
   - `counts.parsed` vs. the operator's own row estimate
   - `counts.invalid` — triage each error
   - `stages.dry_run.byEntity` — confirm the histogram matches expectations
4. **Fix invalid rows in the source** rather than post-hoc in the database.
5. **Re-run dry.** Iterate until `counts.invalid === 0`.
6. **Commit.** `dryRun: false` with Supabase credentials.
7. **Archive.** Save the result JSON and the source file into the operator's migration log folder.
8. **Verify.** Query `legacy_migration_audit` for the run row, then spot-check 5 random entities in the target tables.

---

## 8. Supabase tables

The commit phase writes to these tables. Provision them in `supabase/migrations/`:

- `legacy_invoices`
- `legacy_credit_notes`
- `legacy_receipts`
- `legacy_ledger_cards`
- `legacy_inventory_items`
- `legacy_purchase_orders`
- `legacy_suppliers`
- `legacy_customers`
- `legacy_migration_audit`

Every table should include:
- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz default now()`
- `migration_status text default 'committed'`
- `migration_rolled_back_run text`
- A JSONB column for `extras` so unmapped columns survive.

---

## 9. Tests

`src/imports/legacy-migration.test.js` exercises:
- System detection for every supported format
- Every parser (Excel, Hashavshevet Windows, Hashavshevet ERP, Priority XML, generic CSV)
- Header mapping (Hebrew + English)
- All transform helpers (date, amount, text)
- Israeli-ID / company-ID / invoice-totals validation
- End-to-end pipeline in dry-run mode
- End-to-end pipeline in commit mode with an injected Supabase stub
- Commit failure → rollback soft-flag path
- Migration report generation

Run it:
```bash
node --test src/imports/legacy-migration.test.js
```

---

## 10. FAQ

**Q. A header isn't being recognised.**
Add it to `HEADER_ALIAS` at the top of `legacy-migration.js`. Tests in `legacy-migration.test.js` will catch regressions.

**Q. The file is binary Excel.**
Convert it to the `rawSheets` array form first (see `parseExcelLegacy` doc comment). We deliberately avoid bundling the `xlsx` package — the caller decides whether to use it.

**Q. A commit silently created duplicates.**
The pipeline is idempotent per-row _only if_ the target table has a unique constraint on the legacy key (e.g. `(source_system, invoice_number)`). Add that constraint and the insert will surface an error, which the rollback handler will soft-flag.

**Q. Can I cancel a running migration?**
Yes — since every stage is synchronous except the commit batch, aborting the Node process before commit leaves nothing written. During commit, the rollback handler runs automatically on exception.

**Q. Hebrew date came through.**
It's flagged, not dropped. Inspect `result.errors` for `code: hebrew_date_unsupported`, fix the source, re-run.
