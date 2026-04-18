# Quarterly Tax Compliance Report — דוח ציות מס רבעוני

**Module:** `src/reports/quarterly-tax-report.js`
**Author:** Agent-64 — 2026-04-11
**Status:** v1 (Wave 1.5 / Israel 2026 compliance)
**License:** NEVER DELETE — additive only.

---

## 1. Purpose / מטרה

The Quarterly Tax Compliance Report is an audit-grade rollup of every
statutory tax exposure the company has accumulated over a fiscal quarter.
It is the document the accountant (רו"ח) needs at the start of the
following quarter to:

1. Validate that all VAT periods inside the quarter match the invoices on file.
2. Reconcile withholding-tax remittances against the payments that generated them.
3. Confirm the employer obligation to ביטוח לאומי matches wage slips.
4. Reconcile income-tax advances (מקדמות) against what was required.
5. Pull wage-tax totals straight from payroll.
6. Project the next quarter's obligations so cash flow can be planned.

The report is meant to be **deterministic** — run it twice on the same
closed quarter and you get the same bytes. Mid-quarter runs are allowed
but will be flagged as `computed_from_invoices=true` when VAT periods are
still open.

---

## 2. API

### 2.1 `generateQuarterlyTaxReport(year, quarter, { supabase })`

```js
const { generateQuarterlyTaxReport } = require('./reports/quarterly-tax-report');
const report = await generateQuarterlyTaxReport(2026, 2, { supabase });
// report.sections.vat.totals.net_vat_payable
// report.sanity_checks
// report.status === 'clean' | 'warnings' | 'needs_review'
```

**Arguments**
- `year` — fiscal year (e.g. `2026`)
- `quarter` — one of `1 | 2 | 3 | 4`
- `opts.supabase` — Supabase client (duck-typed; `from(table).select(...).eq(...).gte(...).lte(...)`)
- `opts.includePriorQuarter` — default `true`; used for variance checks

**Returns** a structured `report` object:

```jsonc
{
  "generated_at": "2026-07-01T03:00:00.000Z",
  "report_type": "quarterly_tax_compliance",
  "fiscal_year": 2026,
  "quarter": 2,
  "period_label": "2026-Q2",
  "period_label_he": "רבעון שני (אפריל–יוני)",
  "period_start": "2026-04-01",
  "period_end": "2026-06-30",
  "company": { "legal_name": "...", "vat_file_number": "...", ... },
  "sections": {
    "vat": { ... },
    "withholding": { ... },
    "bituach_leumi": { ... },
    "advance_tax": { ... },
    "wage_tax": { ... },
    "future_obligations": { ... }
  },
  "sanity_checks": [ { "severity": "OK|WARN|CRITICAL", "code", "message_he", "message_en", "details" } ],
  "alerts": [ /* subset: non-OK findings only */ ],
  "prior_quarter": { "year", "quarter", "totals" },
  "inputs_summary": { ... },
  "status": "clean | warnings | needs_review"
}
```

### 2.2 Renderers

| Function | Purpose | Signature |
|---|---|---|
| `renderQuarterlyTaxJson(report)` | API-friendly flat object | sync, returns `{ meta, company, sections, ... }` |
| `renderQuarterlyTaxCsv(report)` | Flat CSV for רו"ח import | sync, returns `string` |
| `renderQuarterlyTaxPdf(report, outputPath)` | Hebrew bilingual A4 PDF | async, returns `{ path, size }` |

### 2.3 Scheduled execution

```js
const { scheduleQuarterlyReport } = require('./reports/quarterly-tax-report');
const cron = require('node-cron'); // or any scheduler with .schedule(expr, fn)

const { spec, handler, meta } = scheduleQuarterlyReport({
  supabase,
  cron,                             // optional — if provided, registers now
  outputDir: 'data/quarterly-tax',  // defaults to data/quarterly-tax
  onComplete: (report) => { /* email to רו"ח, ping Slack, ... */ },
});

// spec === '0 3 1 1,4,7,10 *'
// meta.name === 'quarterly-tax-report'
```

The handler runs on the 1st of January, April, July and October at 03:00
local time. It:

1. Computes which quarter just ended (prior month's quarter).
2. Calls `generateQuarterlyTaxReport`.
3. Writes PDF + JSON + CSV to `outputDir/quarterly-tax-YYYY-Qx.{pdf,json,csv}`.
4. Inserts a row into `quarterly_tax_reports` if the table exists (best-effort).
5. Invokes the `onComplete` callback.

---

## 3. Sections

### 3.1 `sections.vat` — מע"מ רבעוני

Rolls up the three monthly `vat_periods` that fall inside the quarter.
When a period's cached totals are present they are used as-is (source of
truth post-closure). When they're missing we compute from
`tax_invoices` as a mid-quarter fallback.

Key fields:
- `totals.taxable_sales` / `zero_rate_sales` / `exempt_sales`
- `totals.vat_on_sales` — output VAT (מע"מ עסקאות)
- `totals.vat_on_purchases` + `vat_on_assets` — input VAT
- `totals.net_vat_payable` — + payable, − refund
- `totals.is_refund` — boolean
- `months[]` — per-month breakdown with `submitted_at`

### 3.2 `sections.withholding` — ניכוי במקור

Aggregates withholdings grouped by Israeli deduction code
(`WITHHOLDING_CODES` in `CONSTANTS_2026`). The loader prefers
`withholding_payments`, falls back to `vendor_payments.tax_withheld`,
and always folds `wage_slips.income_tax` into code `010` (employment).

Codes shipped by default:

| Code | Label (HE) | Default rate |
|---|---|---|
| 010 | שכר עבודה | — (tax brackets) |
| 020 | שכר אמנים/מרצים | 35% |
| 030 | שכ"ט יועצים וחשבונאים | 30% |
| 035 | שכ"ט עורכי דין | 30% |
| 040 | שירותי עבודה (קבלנים) | 30% |
| 050 | שירותי נכסים | 35% |
| 060 | ריבית | 25% |
| 070 | דיבידנד | 25% |
| 080 | תמלוגים | 30% |
| 090 | עמלות | 30% |
| 099 | אחר | 30% |

Extend `CONSTANTS_2026.WITHHOLDING_CODES` to add more codes — the
builder will pick them up automatically.

### 3.3 `sections.bituach_leumi` — ביטוח לאומי

Sums employer Bituach Leumi + employer health tax + grossed pension
contributions from `wage_slips`. `months[]` has a per-month breakdown;
`totals.employer_total_obligation` is what shows up on the BTL remittance.

### 3.4 `sections.advance_tax` — מקדמות מס הכנסה

Reconciles required vs paid using `advance_tax_payments`. Each row is
classified `balanced | overpaid | underpaid`. When the table has no rows
for the quarter we fall back to deriving required amounts from
`company_tax_profile.advance_tax_rate × taxable_sales` and flag
`derived_required: true` on the section.

### 3.5 `sections.wage_tax` — מס שכר

Pure payroll pull from `wage_slips`. Includes gross, all employee
deductions, all employer contributions, and a `slip_count` for
validation.

### 3.6 `sections.future_obligations` — התחייבויות עתידיות

Projects next-quarter obligations based on the current-quarter
run-rate. Each projection includes due dates computed from
`CONSTANTS_2026.REMITTANCE_DAYS` (default: 15th of month after).

---

## 4. Sanity checks

Each check runs deterministically over the assembled sections and emits
one of `OK | WARN | CRITICAL`. Checks:

| Code | Severity | Rule |
|---|---|---|
| `VAT_PERIOD_LT_INVOICES` / `VAT_PERIOD_GE_INVOICES` | CRITICAL / OK | Period output-VAT ≥ invoice output-VAT |
| `WITHHOLDING_EXCEEDS_PAYMENTS` / `WITHHOLDING_LE_PAYMENTS` | CRITICAL / OK | Total withheld ≤ total payments |
| `NEGATIVE_ADVANCE_PAYMENT` / `ADVANCES_NON_NEGATIVE` | CRITICAL / OK | No negative advances |
| `ADVANCE_UNDERPAID` | WARN / CRITICAL | Shortfall vs required (25% WARN, 50% CRITICAL) |
| `LATE_VAT_SUBMISSION` | WARN | Any month submitted >3 days after due |
| `REVENUE_VARIANCE_WARN/CRITICAL` | WARN / CRITICAL | Taxable sales delta vs Q-1 (25% / 50%) |

Thresholds live in `CONSTANTS_2026.VARIANCE_WARN_PCT`,
`VARIANCE_CRIT_PCT`, and `LATE_PAYMENT_DAYS`.

---

## 5. Data contract

The loaders use Supabase duck-typing (`from().select().eq().gte().lte()`)
and ignore missing tables / missing columns. Expected schemas (see
`supabase/migrations/`):

- `company_tax_profile` — single row, legal identity
- `vat_periods` — id, period_label, period_start, period_end, status, submitted_at, all totals
- `tax_invoices` — id, direction, status, invoice_date, net_amount, vat_amount, is_asset, is_zero_rate, is_exempt
- `wage_slips` — id, employee_id, period_year, period_month, pay_date, gross_pay, income_tax, bituach_leumi, bituach_leumi_employer, health_tax, health_tax_employer, pension_employer, net_pay
- `withholding_payments` *(new — create if missing)* — id, payment_date, withholding_code, base_amount, amount_withheld
- `advance_tax_payments` *(new — create if missing)* — id, year, month, period_label, payment_date, required_amount, paid_amount, status
- `vendor_payments` — optional fallback for withholdings
- `quarterly_tax_reports` *(new — optional archive)* — fiscal_year, quarter, period_label, status, report_json, pdf_path, csv_path, generated_at, generated_by

> **Missing tables degrade gracefully** — totals become zero and the
> report will still render with the non-derivable sections empty.

---

## 6. 2026 tax constants

All live in `CONSTANTS_2026` at the top of
`src/reports/quarterly-tax-report.js`. The values are **ESTIMATED** and
must be re-verified annually against:

- רשות המסים — שיעורי מע"מ, מקדמות מס הכנסה
- ביטוח לאומי — תקנות תשלום
- פקודת מס הכנסה — חלק ה' (מקדמות), סעיף 175

See `src/payroll/CONSTANTS_VERIFICATION.md` for the broader verification
log.

---

## 7. Testing

```bash
cd onyx-procurement
node --test test/quarterly-tax-report.test.js
```

The test file covers:

- Quarter boundary math (incl. cross-year wrap)
- Each section builder with fixture data
- All six sanity checks, CRITICAL and WARN paths
- Empty supabase (no crash)
- No supabase at all (degrades gracefully)
- JSON / CSV / PDF rendering (PDF magic-byte check)
- Scheduler handler end-to-end (writes real files to tmp)
- CSV quote/comma escaping

Current test count: **41 tests, all green**.

---

## 8. Operational notes

- **Output directory** defaults to `data/quarterly-tax/`. The directory
  is created on first run.
- **PDF size** typically 20–40 KB. Hebrew text is embedded as Helvetica
  (pdfkit default); replace with a Hebrew font for full RTL quality.
- **Archive retention** — caller's responsibility. We write
  `quarterly-tax-YYYY-Qx.{pdf,json,csv}` once per quarter-end; older
  files are left in place.
- **Re-runs** — safe. Running `generateQuarterlyTaxReport` twice on the
  same closed quarter produces the same report (modulo `generated_at`).
- **Mid-quarter preview** — allowed. The builder will fall back to
  invoice-based computation for any open VAT periods and flag
  `computed_from_invoices: true`.

---

## 9. Integration points

- **Email to רו"ח** — use `onComplete` in `scheduleQuarterlyReport` with
  your email module.
- **Annual rollup** — downstream `src/tax/annual-tax-routes.js` can
  aggregate 4 quarterly reports into Form 1320.
- **Cash flow forecast** — `src/reports/cash-flow-forecast.js` already
  consumes `tax_obligations`; point that table at the
  `future_obligations` section for a fully-integrated forecast.
- **PCN836** — the VAT section is compatible with
  `src/vat/pcn836.js` inputs; the quarterly report does not *submit*
  PCN836 — it only summarizes the three monthly submissions.

---

## 10. Change log

| Version | Date | Author | Notes |
|---|---|---|---|
| v1 | 2026-04-11 | Agent-64 | Initial build — 6 sections, 6 sanity checks, PDF+JSON+CSV, scheduled job |
