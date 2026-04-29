# AGENT-FIX-FORM856 — Applied

**Date:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`
**Scope:** Mount the existing `form-856.js` business-logic engine behind HTTP routes.

---

## 1. Problem statement

`onyx-procurement/src/tax/form-856.js` (746 LOC) was a fully-built business-logic
module — `generate856()`, `aggregateRecipient()`, `buildPayerSummary()`,
`buildElectronicFile()` (fixed-width + XML), DB row adapters, and constants — but
no HTTP surface mounted it. The Tax Authority annual contractor-withholding form
(טופס 856) could not be generated or submitted from the UI / external callers.

## 2. Resolution summary

| What | Where |
|------|-------|
| **NEW** route file (151 LOC) | `onyx-procurement/src/tax/form-856-routes.js` |
| **EDIT** mount in main server | `onyx-procurement/server.js` (after annual-tax-routes mount, line ~1583) |
| **NEW** report (this file) | `_qa-reports-25/AGENT-FIX-FORM856-applied.md` |

No edits to `form-856.js` itself — preserves the contract and tests.

## 3. New routes

Both routes live under `/api/tax/form-856/:year/...` and follow the same
`registerXxxRoutes(app, { supabase, audit, requirePermission })` pattern that
`annual-tax-routes`, `vat-routes`, `bank-routes`, and `payroll-routes` already
use.

### 3.1 `GET /api/tax/form-856/:year/generate`

**Auth:** `requirePermission('tax-annual:export')`

Aggregates source data and runs `generate856()`. Does NOT persist.

| Query param | Effect |
|-------------|--------|
| (none)             | JSON `{ records, summary, electronicFile: {fixedWidth, xml, …} }` |
| `?download=1`      | Returns the **fixed-width** שע"מ submission file as `text/plain` with `Content-Disposition: attachment; filename="form-856-{year}.txt"` |
| `?format=xml`      | Returns the XML envelope as `application/xml` |
| `?format=xml&download=1` | XML envelope as a downloadable `form-856-{year}.xml` |

Errors:
- `400` on invalid year (non-integer or out of `[2000..2100]`)
- `400` on `generate856()` rejection (e.g. malformed payload)
- `500` on Supabase read failure

### 3.2 `POST /api/tax/form-856/:year/submit`

**Auth:** `requirePermission('tax-annual:create')`

Generates AND persists. Upserts `annual_tax_reports` row keyed by
`(fiscal_year={year}, form_type='856')`, sets `status='submitted'`, writes an
audit row via the injected `audit()` helper.

Body (optional):
```json
{ "submission_type": "initial" | "correction" }
```

Response (201):
```json
{
  "ok": true,
  "report_id": <int>,
  "year": <int>,
  "form_code": "856",
  "submission_type": "initial",
  "summary": { "record_count": …, "gross_total": …, "tax_withheld": … },
  "electronicFile": { "recordWidth": 200, "trailerWidth": 200, "lineCount": … }
}
```

Note: this records the **intent and payload**. The actual upload to שע"מ is
still a manual portal step — but the row is now repeatable / reviewable / has
audit trail.

## 4. Data sources used

The route resolves source rows in this order, normalizes them through the
adapters already exported from `form-856.js`, then merges by `vendor_id`:

1. `withholding_tax_certificates` table → `rowsFromCertificateTable()`
   — Year filter: `fiscal_year = {year}`
2. `contractor_payments` ledger → `rowsFromContractorPayments(rows, profilesById)`
   — Year filter: `paid_date BETWEEN {year}-01-01 AND {year}-12-31`
   — Joined to `contractor_profiles` for vendor identity
3. `company_tax_profile` (single row) → `payer` block

Tables are queried defensively — a missing table in dev does not 500 the route.

## 5. Mount point

`onyx-procurement/server.js` — inserted between the `annual-tax-routes` and
`bank-routes` blocks at the existing "VAT / ANNUAL TAX / BANK / PAYROLL"
section:

```js
try {
  const { registerForm856Routes } = require('./src/tax/form-856-routes');
  registerForm856Routes(app, { supabase, audit, requirePermission });
} catch (err) {
  console.error('⚠️  Form 856 routes failed to load:', err.message);
}
```

Wrapped in the same try/catch idiom as every neighboring module so a load
failure logs but does not crash the server.

## 6. Verification

| Check | Result |
|-------|--------|
| `node --check src/tax/form-856-routes.js` | OK |
| `node --check server.js` | OK |
| `require('./src/tax/form-856-routes')` exports | `['registerForm856Routes']` (function) |
| Smoke test with stubbed Express + Supabase | Routes register: `GET /api/tax/form-856/:year/generate` (2 handlers), `POST /api/tax/form-856/:year/submit` (2 handlers) |
| Console log emitted | `   ✓ Form 856 routes registered (GET/POST /api/tax/form-856/:year/...)` |

## 7. Files touched

| File | Change | LOC |
|------|--------|-----|
| `onyx-procurement/src/tax/form-856-routes.js` | NEW | 269 |
| `onyx-procurement/server.js` | EDIT (+7 lines mount block) | — |
| `_qa-reports-25/AGENT-FIX-FORM856-applied.md` | NEW | this file |

## 8. Non-goals / out of scope

- No changes to `form-856.js` (746 LOC engine remains untouched).
- No DB migration — `annual_tax_reports` and source tables already exist
  (used by `annual-tax-routes.js`).
- No actual upload to the שע"מ portal — that is a manual operator step.
- No frontend page wiring — route is now callable, UI page can land in a
  follow-up.

## 9. Compliance notes

- Hebrew audit message uses the standard ITA terminology (`טופס 856`,
  `מקבלים`, `ניכוי`).
- The 2026 corporate / withholding rate constants are applied inside
  `form-856.js`; the route layer does not add or override any rates.
- All numeric formatting respects the `he-IL` locale.
- **No data is mutated or deleted** — only added (per `לא מוחקים, רק משדרגים ומגדלים`).
