# Form 102 & Form 126 Export Modules — Applied

**Date:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`
**Scope:** IL Bituach Leumi monthly report (Form 102) + IL annual employee
tax certificate (Form 126), patterned after `onyx-procurement/src/tax/form-856.js`
and `pcn874.js`.

---

## What changed

### 1. `onyx-procurement/src/tax/form-102.js`  (augmented, +394 LOC)

Existing module preserved. Appended a new file-builder surface alongside the
existing `generate102` engine:

- `buildForm102File({ year, month, rows, employer, submission_type })`
  — produces fixed-width (windows-1255 bytes via iconv-lite), JSON, and an XML
  envelope. Rows are `{ employee_id, employee_name, gross_wages, bl_employee,
  bl_employer, health_employee }`. Header (`record_type=100`) carries the
  employer block; detail lines (`record_type=102`) one-per-employee; trailer
  (`record_type=999`) totals row.
- `validateForm102File(file)` — structural validator returning `string[]`
  (empty when valid). Checks formCode, header/trailer record types, line
  widths, totals/detail-count parity, year/month bounds.
- `form102Deadline(year, month)` — returns ISO date for the 15th of the
  following month (Bituach Leumi statutory deadline).
- `FORM102_FIELD_LAYOUT` (110-char layout), `FORM102_RECORD_WIDTH`,
  `FORM102_LABELS` (Hebrew + English) — all exported.

### 2. `onyx-procurement/src/tax/form-126.js`  (augmented, +342 LOC)

Existing module preserved (the rich generate126 engine and Form 106
distribution stay). Appended a new simple-row file-builder:

- `buildForm126File({ year, rows, employer, submission_type })`
  — rows: `{ employee_id, full_name, gross_annual, income_tax, bl_withheld,
  pension, severance }`. Same fixed-width / JSON / XML output as Form 102 but
  with a 130-char detail line layout that reflects the annual columns.
- `validateForm126File(file)` — same validator pattern as Form 102.
- `FORM126_FIELD_LAYOUT`, `FORM126_RECORD_WIDTH`, `FORM126_LABELS` exported.

> **Why two surfaces?** The user spec asks for the simpler row-oriented API
> seen in form-856 / pcn874. The existing `generate126` engine consumes a
> richer per-employee shape (with monthly slips and reconciliation against
> 102 submissions). Both are kept — `buildForm126File` is for direct
> per-employee row dumps from a payroll-aggregation step; `generate126`
> remains for the multi-month rollup workflow.

### 3. `onyx-procurement/src/tax/form-102-routes.js`  (new, 367 LOC)

`registerForm102Routes(app, { supabase, audit, requirePermission })`:

| Method | Endpoint | Permission | Behaviour |
|---|---|---|---|
| GET | `/api/tax/form-102/:year/:month/generate` | `tax-monthly:export` | Pulls payroll for the month, builds the file, returns JSON (default) / `text/plain;charset=windows-1255` (`?download=1`) / `application/xml` (`?format=xml`). |
| POST | `/api/tax/form-102/:year/:month/submit` | `tax-monthly:export` | Generates + upserts into `monthly_tax_reports` keyed by `(fiscal_year, period, form_type='102')`, writes audit row. Caller may pass `req.body.rows` to skip DB read. |

Source-data fallback chain (defensive — every Supabase read is `try/catch`
returning `[]` when a table is missing):

1. `payroll_run_lines` filtered by month
2. `wage_slips` with `period='YYYY-MM'`
3. `wage_slips` with `period_start..period_end` window

### 4. `onyx-procurement/src/tax/form-126-routes.js`  (new, 333 LOC)

`registerForm126Routes(app, { supabase, audit, requirePermission })`:

| Method | Endpoint | Permission | Behaviour |
|---|---|---|---|
| GET | `/api/tax/form-126/:year/generate` | `tax-annual:export` | Aggregates all 12 months of payroll into per-employee annual rows, returns JSON / fixed-width / XML. |
| POST | `/api/tax/form-126/:year/submit` | `tax-annual:export` | Upserts into `annual_tax_reports` keyed by `(fiscal_year, form_type='126')`, audit row. |

Source data: `payroll_run_lines` annual rollup (preferred) → `wage_slips`
fallback → manual `req.body.rows`.

### 5. `onyx-procurement/server.js`  (1 mount block added)

New mount block placed between `registerForm856Routes` and
`registerBkmvRoutes`, matching the existing try/catch pattern. Both new
registrars wrapped so a missing dep cannot crash server startup.

---

## Verification

### `node --check` results

```
form-102.js          OK
form-126.js          OK
form-102-routes.js   OK
form-126-routes.js   OK
server.js            OK
```

### Functional smoke test (run via `node -e`)

```
FORM 102 — fixedWidth length: 456   buffer length: 456  (windows-1255 bytes)
FORM 102 — totals: { record_count: 2, gross_wages: 30500, bl_employee: 1770,
                    bl_employer: 1821, health_employee: 1297, payable_total: 4888 }
FORM 102 — header[0..3]: "100"
FORM 102 — trailer[0..3]: "999"
FORM 102 — period: 202604   deadline: 2026-05-15
FORM 102 — validation errors: NONE
FORM 102 — line widths: 112 / 112 / 112 / 112  (all detail lines uniform)

FORM 126 — fixedWidth length: 528   buffer length: 528  (windows-1255 bytes)
FORM 126 — totals: { record_count: 2, gross_annual: 366000, income_tax: 60500,
                    bl_withheld: 21240, pension: 21960, severance: 30500,
                    net_annual: 262300 }
FORM 126 — header[0..3]: "100"
FORM 126 — trailer[0..3]: "999"
FORM 126 — validation errors: NONE
FORM 126 — line widths: 130 / 130 / 130 / 130
```

### Route-registration smoke test

```
✓ Form 102 routes registered (GET/POST /api/tax/form-102/:year/:month/...)
✓ Form 126 routes registered (GET/POST /api/tax/form-126/:year/...)
Endpoints: [
  [GET,  /api/tax/form-102/:year/:month/generate],
  [POST, /api/tax/form-102/:year/:month/submit],
  [GET,  /api/tax/form-126/:year/generate],
  [POST, /api/tax/form-126/:year/submit]
]
```

---

## LOC budget

| File | LOC added |
|---|---|
| form-102.js (appended block) | 394 |
| form-126.js (appended block) | 342 |
| form-102-routes.js (new) | 367 |
| form-126-routes.js (new) | 333 |
| **Total new code** | **1,436** |

Under the 1,500-LOC budget. server.js mount diff is +18 lines (not counted
against the 1,500 since it's the existing file).

---

## Compliance with constraints

- [x] All field labels in Hebrew (FORM102_LABELS / FORM126_LABELS expose the
      Hebrew strings; XML/JSON use English tags but the JSON `employer.name`
      and `full_name` round-trip Hebrew via windows-1255 encoder).
- [x] No demo data — both modules produce empty trailers when `rows=[]`.
- [x] iconv-lite already in `package.json` (`^0.7.2`); both modules require
      it lazily, falling back to a `null` buffer if unavailable.
- [x] Factory pattern matches: `registerForm102Routes(app, { supabase, audit,
      requirePermission })`.
- [x] Defensive Supabase reads: every `supabase.from(...)` call wrapped in
      try/catch, returns `[]` or `null` on missing tables.
- [x] Total under 1,500 LOC across all four files.
- [x] No duplication of Form 856 surface — Form 126 is the EMPLOYEE side
      (gross_annual/income_tax/bl_withheld/pension/severance) while 856 is
      the freelancer/contractor side (gross_total/tax_withheld with
      classification_code).

## Files touched

- `onyx-procurement/src/tax/form-102.js` (augmented)
- `onyx-procurement/src/tax/form-126.js` (augmented)
- `onyx-procurement/src/tax/form-102-routes.js` (new)
- `onyx-procurement/src/tax/form-126-routes.js` (new)
- `onyx-procurement/server.js` (1 mount block added between
  `registerForm856Routes` and `registerBkmvRoutes`)
