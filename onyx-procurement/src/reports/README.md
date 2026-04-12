# `src/reports` — Management Reports

This directory hosts the monthly (and ad-hoc) report generators used by
ONYX / Techno-Kol Uzi's management pipeline. Everything in here is
side-effect-free at import time: generators are plain functions that
accept a pre-assembled data object and write a file to disk. They do
**not** know anything about Supabase, Express, or the filesystem layout
of the rest of the project — callers wire those up.

> **Rule:** additive only. Do NOT delete existing generators. When a
> format changes, add a new module next to the old one and route the
> new callers at the call site.

---

## Modules

| File | Export | Output |
| --- | --- | --- |
| `management-dashboard-pdf.js` | `generateManagementDashboardPDF(data, outputPath)` | Bilingual (Hebrew RTL + English label) monthly management dashboard — A4, pdfkit, 12+ sections |
| `fixtures/sample-mgmt-data.json` | — | Canonical sample payload for the management dashboard; used by tests and local previews |
| `management-dashboard-pdf.test.js` | — | `node --test` smoke suite; wipes and rewrites `src/reports/tmp-mgmt-pdfs/` |

---

## `generateManagementDashboardPDF(data, outputPath)`

### Signature

```js
const { generateManagementDashboardPDF } = require('./reports/management-dashboard-pdf');

const { path, size } = await generateManagementDashboardPDF(data, outputPath);
```

Returns a `Promise<{ path: string, size: number }>`. Rejects only on
invalid arguments (`data` not an object, `outputPath` not a string) or
filesystem errors. The generator is forgiving about missing *sections* —
each section self-skips if its data key is absent or empty, so you can
hand it a partial payload and still get a valid PDF.

### Sections (all optional)

| Section | Data key | Required shape |
| --- | --- | --- |
| Cover page | `company`, `period`, `generated_at` | see below — always rendered |
| Executive Summary | `kpis` | 8 numeric fields (see below) |
| Revenue breakdown | `revenue_breakdown` | `[{ label, amount }]` |
| Expenses by category | `expenses_breakdown` | `[{ category, amount }]` |
| Top 10 suppliers | `top_suppliers` | `[{ name, company_id, total, invoice_count }]` |
| Top 10 customers | `top_customers` | `[{ name, company_id, total, invoice_count }]` |
| Headcount trend | `headcount_trend` | `[{ period, headcount, joiners?, leavers? }]` |
| Overdue invoices | `overdue_invoices` | `[{ invoice_number, customer, due_date, days_late, amount }]` |
| VAT liability | `vat_liability` | `{ output_vat, input_vat, input_vat_fixed_assets?, net_vat_due, due_date?, form_type? }` |
| Outstanding payments | `outstanding_payments` | `[{ supplier, doc_number, due_date, amount, status }]` |
| Critical alerts | `critical_alerts` | `[{ severity, title, message, count? }]` |

The complete, canonical shape is in
[`fixtures/sample-mgmt-data.json`](./fixtures/sample-mgmt-data.json). Copy it as a
starting point and trim whatever you don't have data for.

### Minimal payload

```js
const data = {
  company: { legal_name: 'טכנו-קול עוזי בע"מ', company_id: '515123456' },
  period: { year: 2026, month: 3, label: '2026-03' },
};
await generateManagementDashboardPDF(data, '/tmp/mgmt-2026-03.pdf');
```

This produces a cover-page-only PDF — useful as a health check.

### KPI tile contract

```js
data.kpis = {
  revenue:       2_845_000.50,  // Hebrew: הכנסות
  expenses:      2_130_450.25,  // Hebrew: הוצאות
  pnl:             714_550.25,  // Hebrew: רווח / הפסד — tile goes red if negative
  headcount:              42,   // Hebrew: מצבת עובדים
  open_pos:               17,   // Hebrew: הזמנות פתוחות
  pending_vat:     312_875.40,  // Hebrew: מע"מ לתשלום
  cash_position: 1_845_320.80,  // Hebrew: מצב מזומנים
  ar:              684_250.00,  // Hebrew: חייבים
  ap:              412_800.00,  // Hebrew: זכאים
};
```

All eight tiles render as a 4-by-2 grid. Any missing numeric falls back to 0.

### Critical alerts — severity levels

`severity` drives the left bar colour of the alert row:

| Severity | Colour | Bilingual examples |
| --- | --- | --- |
| `critical` | Red (#a50e0e) | `אישור ניכוי במקור חסר`, `חתימות חסרות בהזמנות רכש` |
| `high` | Orange (#b45309) | late-paying key customers, unreconciled bank lines |
| `medium` | Amber (#8a6d0b) | approaching deadlines, low stock |
| `low` / anything else | Grey (#666666) | informational |

The title and message are printed verbatim — bilingual strings are
typically `"English label / תווית עברית"`.

---

## Running the tests

```bash
# from the onyx-procurement project root
node --test src/reports/management-dashboard-pdf.test.js
```

The test suite will:

1. Wipe `src/reports/tmp-mgmt-pdfs/` (leftover from previous runs)
2. Load the canonical fixture and generate a full PDF
3. Drop each optional section in turn and confirm the generator still builds a valid PDF
4. Verify formatter edge cases and argument validation

The generated PDFs are *left in place* in `src/reports/tmp-mgmt-pdfs/`
so you can open them and eyeball the Hebrew rendering and overall
layout. Delete the directory any time — it will be recreated on the next
test run.

---

## Local preview (no tests)

```bash
node -e "
  const fs = require('fs');
  const path = require('path');
  const { generateManagementDashboardPDF } = require('./src/reports/management-dashboard-pdf');
  const data = JSON.parse(fs.readFileSync(path.join('src', 'reports', 'fixtures', 'sample-mgmt-data.json'), 'utf8'));
  generateManagementDashboardPDF(data, path.join('src', 'reports', 'tmp-mgmt-pdfs', 'preview.pdf'))
    .then(r => console.log('OK', r))
    .catch(err => { console.error(err); process.exit(1); });
"
```

Open `src/reports/tmp-mgmt-pdfs/preview.pdf` in any PDF viewer.

---

## Wiring into the app

The generator is intentionally decoupled from Supabase / Express. Pass
it data that you have already assembled — for example, from a report
builder that runs SQL queries via the existing data layer. A typical
chain looks like:

```js
const { buildManagementDashboardData } = require('./services/management-report-builder');
const { generateManagementDashboardPDF } = require('./reports/management-dashboard-pdf');

async function generateMonthlyDashboard(year, month, outputPath) {
  const data = await buildManagementDashboardData({ year, month });
  return generateManagementDashboardPDF(data, outputPath);
}
```

Because every section is optional, you can ship the data builder in
phases: start with `kpis` + cover page, then add `top_suppliers`,
`overdue_invoices`, etc. as the underlying data becomes available — you
do **not** need to update the PDF generator.

---

## Notes on Hebrew rendering

pdfkit's built-in Helvetica does not contain Hebrew glyphs; Unicode
Hebrew strings are embedded verbatim in the PDF content stream and
picked up by the viewer's font fallback. On macOS and Windows this is
"good enough" for internal reports. If you need pixel-perfect Hebrew
and proper RTL shaping, register a Hebrew TrueType font with
`doc.registerFont()` and use it explicitly — the generator is structured
so this is a one-line change in `renderCoverPage` / `sectionHeader` /
`twoColRow`.

---

## Change log

| Date | Change |
| --- | --- |
| 2026-04-11 | Agent-61 — initial scaffold: `management-dashboard-pdf.js`, fixture, tests, this README |
