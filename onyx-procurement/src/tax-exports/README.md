# src/tax-exports/ — Israel Tax Authority XML export formats

Agent 70 — Wave 2026.

This directory holds **XML-shape** generators for submissions to רשות המסים.
It lives in parallel to `src/vat/pcn836.js`, which is the legacy fixed-width
flat-text encoder (kept untouched).

Every generator in this folder exposes the **same three-function API**:

| Function | Signature | Returns |
| --- | --- | --- |
| `generate(data)` | builds the XML string | `string` (UTF-8 + BOM) |
| `validate(data)` | pre-flight structural checks | `string[]` (empty = OK) |
| `writeToFile(data, outputPath)` | write to disk as UTF-8 bytes | `{ path, bytes, sha256 }` |

All files share:

- **Encoding**: UTF-8 with a leading BOM (`EF BB BF`)
- **Prolog**: `<?xml version="1.0" encoding="UTF-8"?>`
- **Namespace**: `xmlns="http://www.taxes.gov.il/schema/<formCode>"`
- **Dates**: ISO `YYYY-MM-DD`; datetimes full ISO-8601 with `Z`
- **Root element**: `<Report{formCode}>` (see table below)
- A `<Meta>` block with form code, company id, period, submission type, timestamp

## The seven forms

| # | File | Form | What it is |
|---|------|------|------------|
| 1 | `form-1320-xml.js` | **טופס 1320** — Report1320 | Annual corporate tax return (דוח שנתי לחברה): income, expenses, deductions, corporate tax. |
| 2 | `form-857-xml.js`  | **טופס 857** — Report857  | Annual employer withholding report (דוח ניכויים של מעסיקים): per-recipient withholding rows + summary. |
| 3 | `form-126-xml.js`  | **טופס 126** — Report126  | Advance payments report (טופס מקדמות): tax advances paid by the taxpayer against annual liability. |
| 4 | `form-1301-xml.js` | **טופס 1301** — Report1301 | Annual personal tax return (דוח שנתי ליחיד): salary, self-employed, other income, deductions, credit points, tax calc. |
| 5 | `form-102-xml.js`  | **טופס 102** — Report102  | Monthly employer withholding declaration (דיווח חודשי על ניכויי עובדים): income tax + bituach leumi + health, filed with the 15th-of-month payment. |
| 6 | `vat-rashut-hamisim-xml.js` | **מע"מ רבעוני XML** — ReportVATQuarterly | Quarterly VAT in XML form (parallel to the flat PCN836). Sales, purchases, net VAT, invoice-reform allocation stats. |
| 7 | `shv-xml.js` | **שומה עצמית (SHV)** — ReportSelfAssessment | Self-assessment annual calculation: taxpayer's own computation accompanying the annual return. |

## Relationship to `src/vat/pcn836.js`

`pcn836.js` stays as the canonical PCN836 (שמ"ת) encoder:

- **Flat fixed-width ASCII**, Windows-1255, A/B/C/D/Z record types, CRLF lines.
- Untouched. Nothing under `src/tax-exports/` imports or modifies it.

The new `vat-rashut-hamisim-xml.js` is the *XML-shape* alternative accepted
by the newer portals — use whichever the submission endpoint expects.

## Quick use

```js
const tax = require('./src/tax-exports');

const data = {
  companyId: '123456782',
  companyName: 'Acme Ltd',
  taxYear: 2025,
  income: { sales_revenue: 1000000, service_revenue: 250000 },
  expenses: { cogs: 400000, salaries: 300000 },
  corporateTax: { taxable_income: 550000, tax_rate: 23, tax_payable: 126500 },
};

const errors = tax.form1320.validate(data);
if (errors.length) throw new Error(errors.join('; '));

const xml = tax.form1320.generate(data);
const { path, bytes, sha256 } = tax.form1320.writeToFile(data, '/tmp/1320.xml');
```

## Tests

See `tax-exports.test.js` next to this README. Run with:

```bash
node --test src/tax-exports/tax-exports.test.js
```

Each generator is covered by a short smoke test that exercises
`generate`, `validate` (both happy and unhappy paths), and `writeToFile`.

## Important

- XSD validation here is **simulated** — structural checks only. Before real
  submission, cross-check against the official schema pack and your
  accountant's validated test file.
- Hebrew in content fields is passed through as UTF-8. The BOM makes it
  unambiguous for consumers on Windows.
