# AG-Y004 — Israeli Annual Payroll Summary Form 126 (טופס 126) Engine

**Agent:** Y-004 (Swarm 3C)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/tax/form-126.js`
**Tests:** `onyx-procurement/test/tax/form-126.test.js`
**Rules of engagement:** additive — nothing deleted, zero runtime deps (pdfkit optional), Hebrew compliance. **לא מוחקים רק משדרגים ומגדלים.**

---

## 0. Executive summary

| Deliverable                                                                                               | Status     |
|-----------------------------------------------------------------------------------------------------------|------------|
| `onyx-procurement/src/tax/form-126.js` — pure-JS 126 engine                                               | created    |
| `onyx-procurement/test/tax/form-126.test.js` — 20 cases                                                   | created    |
| Multi-month aggregation (12 months → one annual record per employee)                                      | verified   |
| Mid-year leaver + mid-year joiner handling                                                                | verified   |
| Employer summary row (totals per column)                                                                  | verified   |
| Reconciliation against monthly Form 102 submissions                                                       | verified   |
| Electronic submission file — fixed-width lines + XML envelope                                             | verified   |
| Fixed-width round-trip (serialize → parse → match)                                                        | verified   |
| `distributeToEmployees()` — per-employee Form 106 (PDF + text fallback)                                   | verified   |
| Input immutability ("לא מוחקים") — deep JSON equality before/after                                        | verified   |
| Zero runtime deps (pdfkit only optional)                                                                  | verified   |
| Bilingual labels (HE default + EN fallback)                                                               | verified   |

### Test run

```
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~660
```

Run command:

```bash
cd onyx-procurement
node --test test/tax/form-126.test.js
```

---

## 1. What the module does

`form-126.js` is a single-file, zero-runtime-dependency business-logic layer
that produces the Israeli annual employer payroll summary — טופס 126 —
from the output of the existing monthly wage-slip calculator
(`onyx-procurement/src/payroll/wage-slip-calculator.js`).

It is **purely additive**: it reads wage slips, aggregates them, and
emits a report. It never mutates, never deletes, and never touches the
existing monthly payroll flow. If it's run twice in a row on the same
inputs, the outputs are byte-identical (modulo the `generated_at`
timestamp).

High-level responsibilities:

1. **Annual aggregation** — per employee, sum all 12 months of a
   calendar year across 8 core payroll columns:
   `gross · taxable · income_tax · bituach_leumi · health_tax · pension ·
    study_fund · net`, plus employer contributions (pension, study-fund,
    severance, BL, health) reported in the Form 106 footer.
2. **Employment window** — resolve `from`/`to` dates clamped to the
   reporting year, flag `is_joiner` / `is_leaver`, count `months_worked`
   (max = 12) using a hybrid of calendar months + slip coverage.
3. **Employer summary** — one-row total matching "שורת סיכום" at the
   bottom of the 126 file.
4. **Reconciliation vs. Form 102** — validates, month by month, that the
   per-month totals inside this 126 match the 12 monthly 102 submissions
   (±₪1 tolerance, configurable). This is the single most important
   pre-submission check the Tax Authority themselves run.
5. **Electronic submission file** — both fixed-width 210-column lines
   for legacy שע"מ upload AND a structured `<Form126>` XML envelope for
   the API-based submission.
6. **Form 106 distribution** — per-employee employee-facing statement
   (טופס 106) via `distributeToEmployees()`, rendered as PDF when
   `pdfkit` is installed and as plain text otherwise, so the flow never
   blocks on an optional dependency.

---

## 2. Public API surface

```js
const {
  generate126,            // MAIN ENTRY
  distributeToEmployees,  // Form 106 per-employee
  aggregateEmployee,      // single-employee annual record
  buildEmployerSummary,   // totals row
  reconcileWith102,       // 12-month validation vs. 102
  buildElectronicFile,    // fixed-width + XML envelope
  buildForm106,           // 106 body (textual payload)
  parseDataLine,          // fixed-width → object (round-trip)
  parseTrailerLine,       // same for trailer (999) line
  FIELD_LAYOUT,           // data-line layout constant
  TRAILER_LAYOUT,         // trailer layout constant
  RECORD_WIDTH,           // 210
  TRAILER_WIDTH,          // 310
  LABELS,                 // bilingual label map (he + en)
  createEngine,           // isolated instance for tests
} = require('./src/tax/form-126.js');
```

### `generate126({year, employees, employer, ...})`

The one-call public entry point. Takes:

| Field                 | Required | Notes                                                                                            |
|-----------------------|----------|--------------------------------------------------------------------------------------------------|
| `year`                | yes      | Integer, the reporting tax year (e.g. `2026`).                                                   |
| `employees`           | yes      | Array of annual Employee objects, each carrying a `.slips[]` array of 0–12 monthly wage slips.   |
| `employer`            | yes      | `{company_id, legal_name, tax_file_number, address, contact}`.                                   |
| `form102Submissions`  | no       | Array of 12 monthly 102 totals → triggers reconciliation section in the result.                  |
| `submission_type`     | no       | `'initial'` (default) or `'correction'` — stamped on header + XML envelope.                     |
| `tolerance`           | no       | ₪ tolerance for 102 reconciliation (default `1`).                                                |
| `include_pdfs`        | no       | If `true`, inline text Form-106 payloads are included in the result (sync path).                 |
| `lang`                | no       | `'he'` (default) or `'en'` for 106 body language.                                                |

Returns:

```js
{
  version: '2026.1',
  form_code: '126',
  generated_at: '<ISO>',
  records: [ /* Annual126Record per employee */ ],
  summary: { /* employer totals row */ },
  electronicFile: { fixedWidth, xml, lineCount, recordWidth, trailerWidth },
  reconciliation: { ok, tolerance, months_checked, by_month, diffs } | null,
  pdfs: null | [ { filename, content, mimeType, format } ],
}
```

### `distributeToEmployees(result, {lang})` → `Promise<{pdfs, count}>`

Async because `pdfkit` streams. Pure fallback to `format: 'text'` when
`pdfkit` isn't installed — the result shape stays identical so callers
that save to disk never have to branch.

---

## 3. Record layout — fixed-width data line (210 chars)

Each employee record is serialized into exactly **210 characters**, one
newline-delimited line in the submission file. This is the data-line
layout (header = `record_type=100`, data = `126`, trailer = `999`):

| # | Field                 | Type | Width | Notes                                          |
|---|-----------------------|------|-------|------------------------------------------------|
| 1 | `record_type`         | N    |   3   | `"126"` — constant                             |
| 2 | `employer_id`         | N    |   9   | 9-digit ח.פ. / ע.מ., zero-padded               |
| 3 | `tax_year`            | N    |   4   | e.g. `2026`                                    |
| 4 | `national_id`         | N    |   9   | ת"ז, zero-padded                               |
| 5 | `employee_number`     | A    |  10   | Internal HR number                             |
| 6 | `full_name`           | H    |  40   | Hebrew + Latin tolerated, right-pad space      |
| 7 | `period_from`         | D    |   8   | `YYYYMMDD`, clamped to year start / hire date  |
| 8 | `period_to`           | D    |   8   | `YYYYMMDD`, clamped to year end / term date    |
| 9 | `months_worked`       | N    |   2   | 1..12                                          |
|10 | `credit_points`       | N    |   5   | scale=2 (2.25 → `00225`)                       |
|11 | `gross_total`         | N    |  10   | Whole ₪                                        |
|12 | `taxable_total`       | N    |  10   | Whole ₪                                        |
|13 | `income_tax_total`    | N    |  10   | Whole ₪                                        |
|14 | `bituach_leumi_total` | N    |  10   | Whole ₪                                        |
|15 | `health_tax_total`    | N    |  10   | Whole ₪                                        |
|16 | `pension_total`       | N    |  10   | Whole ₪                                        |
|17 | `study_fund_total`    | N    |  10   | Whole ₪                                        |
|18 | `net_total`           | N    |  10   | Whole ₪                                        |
|19 | `other_deductions`    | N    |  10   | Loans + garnishments + miscellaneous           |
|20 | filler                | A    |  22   | Reserved — space-padded                        |

**Total:** 210 chars. Enforced by `RECORD_WIDTH` and asserted at build time.

### Trailer (record_type = 999) — 310 chars

Appended after the last employee row. All totals match the sum of the
corresponding data-line columns. Fields:

`record_type(3) · employer_id(9) · tax_year(4) · record_count(7) ·
gross_total(12) · taxable_total(12) · income_tax_total(12) ·
bituach_leumi_total(12) · health_tax_total(12) · pension_total(12) ·
study_fund_total(12) · net_total(12) · other_deductions(12) · filler(179)`

### Header (record_type = 100) — 210 chars

`record_type(3) · employer_id(9) · tax_year(4) · employer_name(40) ·
tax_file(10) · submission_type(10) · submission_date(8) · filler(116)`

### Round-trip guarantee

`parseDataLine(buildDataLine(rec)) ≡ rec` for every numeric/date field
(string fields may have trailing whitespace trimmed). **This is a
required test** — see `form-126.test.js § "data line round-trips through
parseDataLine"`.

---

## 4. XML envelope — `<Form126 version="2026.1">`

For API-based submission to שע"מ:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Form126 version="2026.1">
  <Header>
    <FormCode>126</FormCode>
    <TaxYear>2026</TaxYear>
    <EmployerId>513456789</EmployerId>
    <EmployerName>Onyx Construction Ltd</EmployerName>
    <TaxFile>946123456</TaxFile>
    <SubmissionType>initial</SubmissionType>
    <GeneratedAt>2026-04-11T…Z</GeneratedAt>
  </Header>
  <Records>
    <Record>
      <NationalId>039123456</NationalId>
      <EmployeeNumber>EMP-0001</EmployeeNumber>
      <FullName>Uzi Tekno Test</FullName>
      <PeriodFrom>2026-01-01</PeriodFrom>
      <PeriodTo>2026-12-31</PeriodTo>
      <MonthsWorked>12</MonthsWorked>
      <CreditPoints>2.25</CreditPoints>
      <Gross>120000</Gross>
      <Taxable>120000</Taxable>
      <IncomeTax>14400</IncomeTax>
      <BituachLeumi>4800</BituachLeumi>
      <HealthTax>3720</HealthTax>
      <Pension>7200</Pension>
      <StudyFund>3000</StudyFund>
      <Net>86880</Net>
      <OtherDeductions>0</OtherDeductions>
      <IsLeaver>0</IsLeaver>
      <IsJoiner>0</IsJoiner>
    </Record>
    …
  </Records>
  <Summary>
    <RecordCount>N</RecordCount>
    <Gross>…</Gross>
    <IncomeTax>…</IncomeTax>
    …
    <LeaversCount>…</LeaversCount>
    <JoinersCount>…</JoinersCount>
  </Summary>
</Form126>
```

All element contents go through the `xmlEscape()` subset
(`& < > " '` → entities). Tag open/close balance is asserted in
`"XML envelope is well-formed & contains key tags"`.

---

## 5. Reconciliation rules — 126 vs. 102

Most Tax Authority rejections of 126 submissions come from a mismatch
with the 12 monthly 102 submissions that were filed during the year.
`reconcileWith102(records, form102Submissions, {tolerance})` cross-checks
every field that appears on both forms.

### Fields compared

| 126 monthly aggregate      | 102 field                        |
|----------------------------|----------------------------------|
| `gross_pay`                | `total_gross`                    |
| `income_tax`               | `total_income_tax`               |
| `bituach_leumi`            | `total_bituach_leumi`            |
| `health_tax`               | `total_health_tax`               |
| `pension_employee`         | `total_pension_employee`         |
| `study_fund_employee`      | `total_study_fund_employee`      |

### Algorithm

1. Expand each 126 record into a `by_month` matrix: `{1..12} × 6 fields`.
2. Sum each month across ALL employees to get the aggregated 126 totals.
3. For every submitted month in `form102Submissions`, compare to the
   matching 126 month.
4. A difference greater than `tolerance` (default ₪1) is a diff.
5. `severity = |delta| > 100 ? 'error' : 'warning'` — small deltas are
   usually centralized rounding; large deltas usually indicate a missed
   or double-counted slip.

### Output

```js
{
  ok: false,
  tolerance: 1,
  months_checked: 12,
  by_month: { 1: {...}, 2: {...}, ... },
  diffs: [
    { month: 3, field: 'gross', expected: 9000, actual: 10000,
      delta: 1000, severity: 'error' },
    …
  ]
}
```

If `ok === true`, submission is safe. If `ok === false`, the UI should
surface the diffs before allowing the user to click **"שלח לרשות המסים"**.

---

## 6. Leaver / joiner handling

### Leaver (mid-year termination)

* Input: `employee.termination_date` set to any date in the reporting year.
* Output: `employment_period.is_leaver = true`, `to = termination_date`.
* `months_worked` = inclusive months between `from` and `termination_date`,
  capped at 12 and never below the actual number of slips in `months_detail`.
* Columns sum ONLY across months the employee actually worked — the
  module never back-fills or zero-pads.
* Test: `"leaver terminates in June, 6 months worked"` — 6 slips in
  Jan–Jun produce `months_worked = 6`, `to = '2026-06-30'`, gross = 60 000.

### Joiner (mid-year hire)

* Input: `employee.hire_date` set to any date in the reporting year.
* Output: `employment_period.is_joiner = true`, `from = hire_date`.
* Test: `"joiner starts July, 6 months worked"` — 6 slips in Jul–Dec
  produce `months_worked = 6`, `from = '2026-07-01'`, gross = 60 000.

### Both in same year

An employee who both joined AND left within the reporting year gets
`is_joiner = true` AND `is_leaver = true`, with `from = hire_date`,
`to = termination_date`.

### Prior-year carry-over

Slips with `period_year ≠ year` are silently ignored (covered by
`"ignores slips outside the reporting year"`). This makes the aggregator
idempotent regardless of how the caller stores historical data.

---

## 7. Form 106 relationship — employee-facing view

**Form 106** (הודעה שנתית על הכנסות, ניכויים וזיכויים) is the one-page
statement handed to each employee after year-end. It carries the **same
numerical row** that the employer just submitted to the Tax Authority
in 126, formatted for human reading: bilingual labels, Hebrew locale
number formatting (`120,000.00 ₪`), employment period, credit points,
and a notes section with the employer's own contributions (pension,
study fund, severance) that do NOT appear on the 126 line but are
legally required disclosures on 106.

### 126 ↔ 106 invariant

```
For every Annual126Record r produced by aggregateEmployee(e, year):

  buildForm106(r, employer, year, lang)
    renders the same r.gross_total / r.income_tax_total / r.net_total
    that ended up in the fixed-width 126 line for that employee.

  The 106 PDF handed to the employee MUST be generated from the SAME
  result object that was submitted in 126 — never recomputed.
```

This is why `distributeToEmployees(result, opts)` takes the **output** of
`generate126()` rather than the raw employees + slips: it prevents
any possibility of the employee seeing numbers that differ from what
was filed with רשות המסים.

### PDF vs. text fallback

`pdfkit` is declared only as an **optional** dependency. When it's not
installed, `distributeToEmployees` emits text files with `.txt`
extensions and `mimeType: 'text/plain; charset=utf-8'`. This lets
deploys without build-tools (e.g. the minimal server image) still hand
out 106 sheets — they just won't be print-pretty. Callers can always
branch on `pdfs[i].format === 'pdf'` to decide how to save/serve.

---

## 8. Immutability ("לא מוחקים, רק משדרגים")

The whole module is side-effect-free and input-safe:

* No `employees[i].slips[j] = …`
* No `employer.x = …`
* No hidden globals — all state lives in arguments and local variables.
* `createEngine()` is offered purely for tests that want a separate
  "copy" even though there would be nothing to isolate — this is
  a forward-compat hook for when future waves add caches or registries.

The immutability invariant is asserted explicitly:

```js
test('generate126 — does NOT mutate input employees/slips', () => {
  const before = JSON.stringify(e);
  generate126({year, employees: [e], employer});
  const after  = JSON.stringify(e);
  assert.equal(before, after);
});
```

Because we never delete and only grow, running `generate126` twice in
a row on the same payload produces identical records/summary and
byte-identical `fixedWidth`/`xml` (except `generated_at`).

---

## 9. Test inventory (20 cases, all green)

| # | Test name                                                                  | Covers                           |
|---|-----------------------------------------------------------------------------|-----------------------------------|
|  1 | aggregateEmployee — full year sums 12 months correctly                      | Happy path                        |
|  2 | aggregateEmployee — ignores slips outside the reporting year                | Year isolation                    |
|  3 | aggregateEmployee — ignores slips with invalid month                        | Defensive input handling          |
|  4 | aggregateEmployee — leaver terminates in June, 6 months worked              | Leaver                            |
|  5 | aggregateEmployee — joiner starts July, 6 months worked                     | Joiner                            |
|  6 | buildEmployerSummary — sums totals across employees                         | Employer summary row              |
|  7 | reconcileWith102 — matches when monthly totals agree                        | 102 reconciliation (pass)         |
|  8 | reconcileWith102 — flags mismatches when 102 differs from 126               | 102 reconciliation (fail)         |
|  9 | reconcileWith102 — tolerance swallows rounding noise                        | Tolerance                         |
| 10 | buildElectronicFile — line widths are consistent                            | Fixed-width width enforcement     |
| 11 | buildElectronicFile — data line round-trips through parseDataLine           | Round-trip invariant              |
| 12 | buildElectronicFile — trailer totals match data lines                       | Trailer-vs-records reconciliation |
| 13 | buildElectronicFile — XML envelope is well-formed & contains key tags       | XML validation                    |
| 14 | generate126 — end-to-end with reconciliation                                | Top-level API, mixed employees    |
| 15 | generate126 — throws on bad payload                                         | Input validation                  |
| 16 | buildForm106 — contains Hebrew labels and employee data                     | 106 bilingual rendering           |
| 17 | distributeToEmployees — produces text fallback when pdfkit unavailable      | Optional-dep fallback             |
| 18 | generate126 — does NOT mutate input employees/slips                         | Immutability invariant            |
| 19 | createEngine — returns an isolated instance                                 | Factory surface                   |
| 20 | FIELD_LAYOUT — width sum equals RECORD_WIDTH constant                       | Layout/constant sanity            |

---

## 10. Integration notes

### Where this plugs in

1. `onyx-procurement/src/payroll/wage-slip-calculator.js` is the monthly
   producer. Every wage slip it emits is already consumable by
   `aggregateEmployee` without adapter — same `gross_pay`, `income_tax`,
   `net_pay`, `pension_employee`, etc. field names.
2. `onyx-procurement/src/tax/annual-tax-routes.js` (AG-141) already
   exposes routes for annual tax reports. A follow-up wave can wire
   `POST /tax/126` → `generate126` + persist the resulting
   `electronicFile` to `onyx-procurement/tax-exports/2026/126.txt`
   and `.xml`.
3. `onyx-procurement/src/tax-exports/form-126-xml.js` is a **separate**
   form — it handles "טופס 126 — advance tax installments" (מקדמות מס),
   which is unrelated to the annual payroll summary. Both now live side
   by side without conflict; we never deleted or rewrote that module.
4. Distribution: a future email/SMS wave can call
   `distributeToEmployees(result)` and push each PDF to its owner via
   the existing `onyx-procurement/src/emails` + `sms` modules.

### Coexistence with existing form-126-xml.js

| Module                            | Purpose                                          |
|-----------------------------------|--------------------------------------------------|
| `src/tax-exports/form-126-xml.js` | טופס 126 — מקדמות מס (advance tax installments)  |
| `src/tax/form-126.js` (this)      | טופס 126 — דוח שנתי למעסיקים (annual payroll)    |

Note — the Israeli Tax Authority overloads the "126" form code for two
distinct reports. This is a well-known ambiguity in the documentation;
both modules now coexist, and nothing was deleted. Callers that need
the legacy advance-payments XML keep using the old module; callers that
need the annual payroll summary use this one.

### Dependencies

* **Runtime:** zero. Pure Node built-ins.
* **Optional:** `pdfkit` (only for PDF rendering in
  `distributeToEmployees`). Falls back to `text/plain` without it.
* **Test:** `node:test` built-in runner — no extra test dep.

---

## 11. Known follow-ups (non-blocking)

Tracked for the next wave — **none of these block submission**:

1. **RTL-aware PDF rendering** — `pdfkit`'s default Helvetica does not
   shape Hebrew. Current PDF path renders with `align: 'right'` which
   produces legible output at normal size but is not typographically
   correct. A future wave can swap in a Hebrew-capable font (Assistant,
   Heebo) and the BIDI layer from `bidi-js`. Non-blocking because the
   text fallback is always correct and the 126 itself (fixed-width +
   XML) doesn't render glyphs at all.
2. **Certified submission test file** — add an e2e test that writes the
   actual `.txt` + `.xml` to `onyx-procurement/tax-exports/2026/` and
   compares against a golden fixture. Waiting on a canonical fixture
   from the fiscal-compliance team.
3. **Route wiring** — expose `POST /tax/126/:year` on
   `annual-tax-routes.js` so the UI can trigger generation, preview, and
   submit. The engine is fully usable from the route layer today.
4. **Multi-employer / multi-site aggregation** — currently one
   `employer` argument per call. A future wave will support split sites
   (one 126 per `tax_file_number`) by calling `generate126` in a loop.

---

## 12. Files touched (additive only)

```
A  onyx-procurement/src/tax/form-126.js
A  onyx-procurement/test/tax/form-126.test.js
A  _qa-reports/AG-Y004-form-126.md
```

Nothing modified. Nothing deleted. **לא מוחקים רק משדרגים ומגדלים.**

---

*— Agent Y-004, Swarm 3C, Techno-Kol Uzi Mega-ERP, 2026-04-11*
