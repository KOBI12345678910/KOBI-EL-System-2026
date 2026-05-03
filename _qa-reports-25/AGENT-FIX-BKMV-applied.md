# AGENT-FIX-BKMV — Applied

**Date:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`
**Agent:** 216 — Tax Authority "מבנה אחיד" / Income Tax regulation 36
**Scope:** Mount the existing `bkmv-unified.js` builder behind HTTP routes.

---

## 1. Problem statement

`onyx-procurement/src/tax-exports/bkmv-unified.js` (597 LOC) was a fully built
buffer-builder for the eight-record מבנה אחיד audit format
(`A100`, `B100`, `B110`, `C100`, `D110`, `D120`, `M100`, `Z900`) plus the
companion `INI.TXT` descriptor — but **no HTTP surface mounted it**. A Tax
Authority inspector requesting the *one-file-on-demand* audit dump under
regulation 36 could not be served from the API.

## 2. Resolution summary

| What | Where |
|------|-------|
| **NEW** route file (397 LOC) | `onyx-procurement/src/tax-exports/bkmv-routes.js` |
| **EDIT** mount in main server | `onyx-procurement/server.js` (after `form-856-routes`, before `bank-routes`) |
| **NEW** report (this file) | `_qa-reports-25/AGENT-FIX-BKMV-applied.md` |

No edits to `bkmv-unified.js` itself — preserves the contract, the eight
record builders, and the SHA-256 trailer. The new file is purely a thin
HTTP/Supabase adapter.

## 3. New routes

All routes live under `/api/tax/bkmv/...` and follow the same
`registerXxxRoutes(app, { supabase, audit, requirePermission })` pattern as
`vat-routes`, `annual-tax-routes`, `form-856-routes`, `bank-routes`,
`payroll-routes`.

### 3.1 `GET /api/tax/bkmv/:year/generate` — primary endpoint

**Auth:** `requirePermission('tax-bkmv:generate')`

Pulls inputs from Supabase, calls `buildUnifiedFile()`, runs `validateFile()`
on the produced BKMVDATA buffer, archives both files to disk, writes an audit
row, and returns the artifacts.

| Query param | Effect |
|-------------|--------|
| (none)              | JSON envelope with metadata, archive paths, and base64 payloads of both files |
| `?artifact=bkmv`    | Streams BKMVDATA.TXT directly (`text/plain; charset=windows-1255`) with `Content-Disposition: attachment; filename="BKMVDATA_{taxId}_{year}.TXT"` |
| `?artifact=ini`     | Streams INI.TXT directly with the matching filename |

Errors:
- `400` — invalid year (must be 4-digit integer in `[1990..2100]`)
- `412` — `company_tax_profile` row missing (PUT `/api/vat/profile` first)
- `422` — structural validation failure (record-width mismatch, missing
  `A100`/`Z900` sentinels) — returns up to 20 detail strings + the metadata
- `500` — Supabase read or builder error

### 3.2 `GET /api/tax/bkmv/:year/preview` — dry-run

Same builder, **no archive, no audit, no permission check**. Useful for UI
"what-would-this-look-like" panels and tests. Returns metadata + first 5
record lines + validation errors (if any).

### 3.3 `GET /api/tax/bkmv/:year/last`

Lists the most recently archived `BKMVDATA_*` and `INI_*` artifacts for the
given year, mtime-sorted.

### 3.4 `GET /api/tax/bkmv/:year/download/:file`

`file` ∈ `{bkmv, ini}` — streams the most recent archived artifact for the
year. Same `Content-Disposition` as `?artifact=`.

### 3.5 `GET /api/tax/bkmv/health`

Module liveness — returns the record-width reference table from
`bkmv-unified` so callers can sanity-check field budgets without opening a
fixed-width file.

## 4. Data sources resolved

The loader pulls from these Supabase tables, scoped to the half-open window
`[YYYY-01-01, (YYYY+1)-01-01)` for date-bearing rows. Every fetch is wrapped
in `safeFetch()` — a missing table in dev returns `[]` instead of 500-ing the
route, so a partial file (just `A100` + `Z900`) is still produced.

| Record | Table preferred → fallback | Filter |
|--------|----------------------------|--------|
| `A100` | `company_tax_profile` (limit 1) — required, **412 if missing** | — |
| `B100` | `gl_lines` | `date IN [yStart, yEnd)` |
| `B110` | `chart_of_accounts` | none — full chart |
| `C100` | `tax_invoices` | `direction='output' AND status<>'voided' AND invoice_date IN [yStart, yEnd)` |
| `D110` | `tax_invoices` | `direction='input'  AND status<>'voided' AND invoice_date IN [yStart, yEnd)` |
| `D120` | `receipts` → `customer_payments` | `*_date IN [yStart, yEnd)` |
| `M100` | `inventory_items` → `items` | none |
| `Z900` | (synthesized — control totals + SHA-256 of body) | — |

`tax_invoices`, `company_tax_profile`, `chart_of_accounts`, and
`customer_payments` already exist in the wave-1.5 schema (used by
`vat-routes.js` / `annual-tax-routes.js`). `gl_lines`, `receipts`,
`inventory_items` are tolerated as optional in dev.

## 5. Archive layout

```
data/bkmv/<YEAR>/
  BKMVDATA_<taxId>_<YEAR>.TXT        # windows-1255, CRLF, fixed-width
  INI_<taxId>_<YEAR>.TXT             # windows-1255, CRLF, key=value
```

Root override: `process.env.BKMV_ARCHIVE_DIR` (defaults to
`onyx-procurement/data/bkmv`). The directory is created on first request.

## 6. Mount point

`onyx-procurement/server.js` — inserted between the `form-856-routes` block
and the `bank-routes` block in the existing
"VAT / ANNUAL TAX / BANK RECONCILIATION / PAYROLL" section:

```js
// BKMV — מבנה אחיד / regulation 36 (Agent 216)
// Generates BKMVDATA.TXT + INI.TXT (windows-1255) for tax-authority audits.
// Mounts: GET /api/tax/bkmv/:year/generate (+ preview / last / download / health)
try {
  const { registerBkmvRoutes } = require('./src/tax-exports/bkmv-routes');
  registerBkmvRoutes(app, { supabase, audit, requirePermission });
} catch (err) {
  console.error('⚠️  BKMV (מבנה אחיד) module failed to load:', err.message);
}
```

Wrapped in the standard try/catch — a load failure logs but does not crash
the server.

## 7. Verification

| Check | Result |
|-------|--------|
| `node --check src/tax-exports/bkmv-routes.js` | **OK** |
| `node --check server.js` | **OK** |
| `require('./src/tax-exports/bkmv-routes')` export | `['registerBkmvRoutes']` (function) |
| Smoke test with stubbed Express + Supabase — routes registered | `GET /api/tax/bkmv/health`<br>`GET /api/tax/bkmv/:year/generate`<br>`GET /api/tax/bkmv/:year/preview`<br>`GET /api/tax/bkmv/:year/last`<br>`GET /api/tax/bkmv/:year/download/:file` |
| Console log emitted on register | `✓ bkmv-unified wired — GET /api/tax/bkmv/:year/generate (regulation 36)` |
| End-to-end builder dry-run (empty year, minimal `companyProfile`) | `bkmvBytes=329`, `iniBytes=523`, `totalRecords=2` (A100+Z900), `validate errors=0` |

## 8. Files touched

| File | Change | LOC |
|------|--------|-----|
| `onyx-procurement/src/tax-exports/bkmv-routes.js` | **NEW** | 397 |
| `onyx-procurement/server.js` | **EDIT** (+10 lines mount block) | — |
| `_qa-reports-25/AGENT-FIX-BKMV-applied.md` | **NEW** | this file |

## 9. Non-goals / out of scope

- No edits to `bkmv-unified.js` (597 LOC engine remains untouched).
- No DB migration — all source tables already exist (or are tolerated as
  missing via `safeFetch()`).
- No frontend page wiring — the route is now callable; a "Generate
  מבנה אחיד" button on Finance360 / Tax-Audit page can land in a follow-up.
- The `tax-bkmv:generate` permission string is referenced by
  `requirePermission()`; if not yet in `rbac.js` `RESOURCES`, the middleware
  will deny non-admin callers — admin role is sufficient for the smoke
  endpoint until RBAC is updated.

## 10. Compliance notes

- The Hebrew audit message follows the ITA terminology
  (`BKMVDATA + INI לשנת {year} — N רשומות`).
- File encoding is **windows-1255** (CP-1255), CRLF line terminator — exactly
  what `bkmv-unified` produces.
- The eight record types and their fixed widths come straight from
  `RECORD_WIDTHS` in `bkmv-unified` — the route layer does not redefine any
  field budget.
- `Z900` carries the SHA-256(body)[:16] checksum; the full SHA-256 of the
  file is in `metadata.fileChecksum` and inside `INI.TXT`.
- **No data is mutated or deleted** — only read + serialized + archived
  (per `לא מוחקים, רק משדרגים ומגדלים`).
