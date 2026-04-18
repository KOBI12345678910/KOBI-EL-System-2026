# Profit & Loss (P&L) Report

דוח רווח והפסד — monthly, quarterly and annual P&L generator.

Module: `src/reports/pnl-report.js`
Tests:  `src/reports/pnl-report.test.js`
Owner:  Agent 62

---

## 1. Scope

`pnl-report.js` generates a Profit & Loss statement that follows the
standard Israeli financial-statement structure:

```
Revenue (הכנסות)                          +
 Cost of Goods Sold (עלות המכר)          -
─────────────────────────────────────────
= Gross Profit (רווח גולמי)

 Operating Expenses (הוצאות תפעול)       -
─────────────────────────────────────────
= Operating Profit / EBIT (רווח תפעולי)

 Finance income  (הכנסות מימון)           +
 Finance expense (הוצאות מימון)           -
─────────────────────────────────────────
= Profit Before Tax / EBT (רווח לפני מס)

 Corporate Tax 23% (מס חברות)            -
─────────────────────────────────────────
= Net Income (רווח נקי)
```

The corporate tax rate is exposed as `CORPORATE_TAX_RATE` (defaults to
`0.23`, Israel's statutory corporate rate since 2018). A tax provision
is never computed on a loss — `taxProvision` is capped at zero.

---

## 2. Public API

```js
const {
  generatePNL,       // async — fetches from Supabase then computes
  generatePNLJson,   // sync  — UI-ready JSON
  generatePNLPdf,    // async — writes a PDF via pdfkit
  generatePNLExcel,  // sync  — writes SpreadsheetML 2003 XML
  computePNL,        // sync  — core computation on in-memory data
  resolvePeriod,     // sync  — period/label resolver
} = require('../reports/pnl-report');
```

### 2.1 `generatePNL(year, month, { supabase })`

Fetches raw inputs from Supabase for the target period, the previous
period (month-over-month / quarter-over-quarter), and the year-ago
period (year-over-year), and returns a full P&L with comparisons.

**Arguments**

| Name       | Type                      | Notes                                                  |
| ---------- | ------------------------- | ------------------------------------------------------ |
| `year`     | `number`                  | 4-digit year (required).                               |
| `month`    | `number \| string \| null`| `1..12` for monthly, `'Q1'..'Q4'` quarterly, `null` annual. |
| `supabase` | `object`                  | Supabase JS client. If omitted, returns an empty report with warnings. |

**Returns** — A report object containing:

- `meta` — label, start, end, currency, generation timestamp.
- `period` — resolved period with prev/yoy anchors.
- `revenue`, `cogs`, `operatingExpenses` — each with `lines[]` and `total`.
- `grossProfit`, `ebit`, `ebt`, `taxProvision`, `netIncome` — scalar ILS values.
- `grossMargin`, `operatingMargin`, `netMargin` — percentages (or `null` when revenue is zero).
- `financeNet` — `{ income, expense, net }`.
- `comparisons` — `{ mom: {...}, yoy: {...} }`, each with `current`, `previous`, `pct`.
- `warnings` — strings describing any missing source tables.

### 2.2 `generatePNLJson(data)`

Flattens a core P&L into a UI-friendly JSON with formatted ILS strings
(`Intl` `he-IL`) and per-line audit counts. Safe to send to a frontend.

### 2.3 `generatePNLPdf(data, outputPath)`

Writes a multi-page PDF using `pdfkit` (already in the project's
dependencies). Pages:

1. **P&L statement** — all lines with ILS amounts right-aligned.
2. **Comparisons** — MoM and YoY percentage deltas for the headline numbers.
3. **Audit trail** — every non-empty line with its source refs.

Returns a Promise that resolves to `outputPath`.

### 2.4 `generatePNLExcel(data, outputPath)`

Generates an Excel-compatible **SpreadsheetML 2003 XML** file. We do not
ship a full `.xlsx` (zip) encoder, so XML format was chosen deliberately:
Excel, LibreOffice Calc, and Google Sheets all open it. The file carries:

- Header + period
- Revenue, COGS, OpEx, Finance, Tax, Net Income rows
- Comparison block (MoM / YoY %)
- Audit trail block

Suggested extension: `.xml` or `.xls` (Excel will open either).

### 2.5 `computePNL(data, opts)`

The pure computational core. Accepts an in-memory dataset in the same
shape returned by `loadPeriodData()` and returns the P&L structure with
no I/O and no Supabase dependency. This is what the tests exercise
primarily.

---

## 3. Data sources (Supabase tables)

`generatePNL` issues parallel reads against the following tables. A
missing table does not fail the report — it emits a warning instead:

| Table                | Used for                                          |
| -------------------- | ------------------------------------------------- |
| `customer_invoices`  | Revenue (sales / services / other).               |
| `tax_invoices`       | COGS and OpEx (direction='input').                |
| `payroll_runs`       | Production labor (COGS) vs office labor (OpEx).   |
| `gl_entries`         | Catch-all via `ACCOUNT_MAP`.                      |
| `transactions`       | Finance income (`interest_income`) / expense (`bank_fees`, `interest_expense`). |

Voided / cancelled invoices are skipped. Capital purchases
(`is_asset = true`) are **never** charged to P&L — they belong on the
balance sheet and are depreciated over time via the `*_depreciation`
lines.

---

## 4. Classification rules

The classifiers are exported so that tests can pin them down:

- `classifyRevenue(inv)` — returns `'sales' | 'services' | 'other'` from
  `revenue_category`.
- `classifySupplierInvoice(inv)` — returns the bucket code, e.g.
  `'cogs.rawMaterials'`, `'operatingExpenses.rent'`, or `null` for capital.
- `classifyPayroll(run)` — returns `'cogs.productionLabor'` when
  `category` is `production|factory|shop_floor`, otherwise
  `'operatingExpenses.salaries'`.

The GL catch-all is driven by `ACCOUNT_MAP`, which maps account codes
(e.g. `revenue_sales`, `cogs_raw_materials`) to line codes. Revenue /
finance-income accounts are treated as natural-credit, so their sign is
inverted before being added to the line.

---

## 5. Audit trail

Every P&L line carries an `audit` array. Each entry is:

```json
{
  "source":  "customer_invoice" | "supplier_invoice" | "payroll_run" | "gl_entry" | "transaction",
  "id":      "<primary key>",
  "ref":     "<human reference, e.g. invoice number>",
  "amount":  123.45,
  "po_id":   "<optional — present for supplier invoices>",
  "account": "<optional — present for gl_entry>"
}
```

This makes the report drill-down-able from any cell back to its
originating row.

Both the PDF and the Excel/XML output include an **Audit Trail**
section that lists every contributing entry grouped by line, so that a
reviewer can tie every number back to a source document.

---

## 6. YoY and MoM comparisons

`generatePNL` runs the same computation on three separate datasets:

1. **Current period** — e.g. 2026-04.
2. **Previous period** — e.g. 2026-03 (monthly) or 2026-Q1 (quarterly).
   *Skipped* for annual reports.
3. **Year-ago period** — e.g. 2025-04.

The three results are then diffed in `buildComparisons()` for the
headline numbers (`revenue`, `cogs`, `grossProfit`, `operatingExpenses`,
`ebit`, `ebt`, `netIncome`). Each bucket exposes:

```json
{
  "current":  123.45,
  "previous": 100.00,
  "pct":      23.45
}
```

When the base value is zero, `pct` is `null` to avoid divide-by-zero
noise.

---

## 7. Usage examples

### 7.1 Monthly report, JSON for the UI

```js
const pnl = require('./src/reports/pnl-report');

const report = await pnl.generatePNL(2026, 4, { supabase });
const ui = pnl.generatePNLJson(report);
res.json(ui);
```

### 7.2 Quarterly report, PDF download

```js
const report = await pnl.generatePNL(2026, 'Q2', { supabase });
const file = await pnl.generatePNLPdf(report, '/tmp/pnl-2026-Q2.pdf');
res.download(file);
```

### 7.3 Annual report, Excel export

```js
const report = await pnl.generatePNL(2026, null, { supabase });
const file = pnl.generatePNLExcel(report, '/tmp/pnl-2026.xml');
res.download(file, 'pnl-2026.xml');
```

### 7.4 Offline computation on a fixture

```js
const core = pnl.computePNL({
  customerInvoices: [/* ... */],
  supplierInvoices: [/* ... */],
  payrollRuns:      [/* ... */],
  glEntries:        [/* ... */],
  transactions:     [/* ... */],
});
console.log(core.netIncome);
```

---

## 8. Tests

Run the unit tests:

```bash
node --test src/reports/pnl-report.test.js
```

The test suite covers:

- Money rounding, summing, and percent-change helpers.
- Revenue / supplier / payroll classifiers.
- Period resolution for monthly, quarterly and annual ranges.
- End-to-end `computePNL` headline numbers on a hand-verifiable fixture.
- Capital-purchase exclusion from P&L.
- Zero-revenue margins are `null`; losses do not produce tax credits.
- Audit trail integrity (source, id, ref, po_id).
- `generatePNLJson` UI shape.
- `generatePNL` full pipeline with a **fake Supabase client** that
  returns canned datasets for the current / prev / YoY ranges, and
  verifies MoM / YoY percentages.
- Graceful degradation when no Supabase client is supplied.
- `generatePNLExcel` XML output: validity, totals present, XML escaping.

---

## 9. Caveats and TODOs

1. **Chart of accounts mapping.** `ACCOUNT_MAP` is a reference starting
   point. Have a CPA align the keys to the company's real Israeli
   chart of accounts before relying on GL-driven lines.
2. **Accrual vs cash.** The computation is issue-date-based (accrual).
   If the company reports on a cash basis, swap `issue_date` for the
   payment date when loading data.
3. **Tax rate.** `CORPORATE_TAX_RATE = 0.23`. Confirm each fiscal year
   against רשות המסים guidance — a change can be handled by overriding
   the constant from a config module without touching the report logic.
4. **Depreciation.** `cogs.depreciation` and
   `operatingExpenses.depreciation` are wired into the structure but
   require a depreciation schedule module to populate. Until then they
   are driven only by matching GL entries.
5. **Multi-currency.** The report assumes ILS throughout. FX-translated
   entries must be converted upstream of this module.
6. **True `.xlsx`.** SpreadsheetML XML is universally readable but
   older than OOXML. If a zip-based `.xlsx` is required later, swap the
   `generatePNLExcel` implementation without touching the computation.
