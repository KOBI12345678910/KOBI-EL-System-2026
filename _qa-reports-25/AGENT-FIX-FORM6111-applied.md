# AGENT-FIX-FORM6111 — applied

**Scope** — IL Form 6111 (annual income tax return / דין וחשבון שנתי) export
module for Techno-Kol Uzi ERP 2026.

**Date** — 2026-04-29
**Branch** — `claude/objective-merkle-40ff93`

---

## Files changed

| File | Status | LOC delta |
|------|--------|-----------|
| `onyx-procurement/src/tax/form-6111.js` | extended (additive) | +222 |
| `onyx-procurement/src/tax/form-6111-routes.js` | created | 257 |
| `onyx-procurement/server.js` | mount block added | +10 |

**Total new LOC across new/added blocks: 479** (under the 500 LOC budget).

The pre-existing `form-6111.js` engine (1071 lines, the
trial-balance-driven `generate6111`) is preserved untouched —
לא מוחקים, רק משדרגים. The new file-builder API is appended as a
parallel surface, mirroring the form-102 / form-856 pattern.

---

## New public exports (form-6111.js)

```js
const {
  buildForm6111File,         // ({year, revenue, expenses, taxable?, tax?, advances?, company?})
  validateForm6111File,      // (fileObj | Buffer | string) → string[]
  computeDeadline,           // (year) → "YYYY-04-30" of (year+1)
  FORM6111_FIELD_LAYOUT,     // 7-field, 80-char fixed-width layout
  FORM6111_RECORD_WIDTH,     // 80
  FORM6111_ROWS,             // canonical row codes 1000/4900/9100/9300/9400/9500
} = require('./src/tax/form-6111');
```

### Fixed-width layout (80 chars, windows-1255 ready)

| Field | Width | Type | Notes |
|-------|------:|------|-------|
| record_type | 3 | A | `A10` (header) / `B20` (detail) / `Z99` (trailer) |
| tin | 9 | N | company ת.ז./ח.פ., zero-padded |
| tax_year | 4 | N | YYYY |
| row_code | 4 | N | 1000-9999 (form-6111 code) |
| label | 40 | H | Hebrew row label |
| amount | 14 | S | signed shekels (sign + zero-padded body) |
| filler | 6 | A | `INIT` / `CORR` on header, blank elsewhere |

### Row set

`revenue (1000) → expenses (4900) → taxable (9100) → tax (9300) →
advances (9400) → balance (9500)`. Auto-computes `taxable = revenue - expenses`
and `tax = max(0, taxable) * 23%` (CONSTANTS_2026.CORPORATE_TAX_RATE) when not
explicitly supplied.

`computeDeadline(year)` returns `YYYY-04-30` for `year+1` (4 months after the
calendar-year close).

---

## Routes (form-6111-routes.js)

`registerForm6111Routes(app, { supabase, audit, requirePermission })` — same
factory pattern as `registerForm856Routes` / `registerForm102Routes`.

| Method | Path | Permission | Purpose |
|--------|------|-----------|---------|
| GET | `/api/tax/form-6111/:year/generate?format=json\|fixed\|xml&download=1` | `tax-annual:export` | preview / download |
| POST | `/api/tax/form-6111/:year/submit` | `tax-annual:create` | generate + upsert into `annual_tax_reports` (`form_type='6111'`, `status='submitted'`) + audit row |
| GET | `/api/tax/form-6111/:year/deadline` | `tax-annual:export` | UI helper |

`format=fixed` returns the windows-1255 buffer with
`Content-Type: text/plain; charset=windows-1255`.
`format=xml` returns the UTF-8 envelope.

### Source data fall-through (defensive Supabase reads)

1. `annual_close_summary` (preferred — pre-aggregated)
2. `general_ledger_summary` (fallback — buckets revenues 1000-1999, expenses 2000-4999)
3. `req.body.figures` (manual override)

Missing tables yield zeros instead of 500 errors.

---

## Server mount

Added immediately after `registerForm856Routes` mount in `server.js`
(lines 1652-1659 in the patched file). Wrapped in the same `try/catch` as
peer mounts so a load failure logs but does not crash boot.

---

## Verification

```sh
node --check onyx-procurement/src/tax/form-6111.js          # OK
node --check onyx-procurement/src/tax/form-6111-routes.js   # OK
node --check onyx-procurement/server.js                     # OK
```

### Smoke test (no supabase, pure builder)

```js
buildForm6111File({
  year: 2026, revenue: 1_200_000, expenses: 800_000, advances: 50_000,
  company: { tin: '512345678', legal_name: 'Techno-Kol Uzi Ltd' },
})
```

Produced:

| field | value |
|-------|-------|
| `formCode` | `6111` |
| `deadline` | `2027-04-30` |
| `recordWidth` | `80` |
| `lineCount` | `8` (header + 6 detail + trailer) |
| `headerType` | `A10` |
| `trailerType` | `Z99` |
| `totals.taxable` | `400000` (auto-computed) |
| `totals.tax` | `92000` (auto-computed at 23%) |
| `totals.balance` | `42000` (`tax − advances`) |
| `bufferBytes` | `656` (windows-1255 encoded) |
| `validateForm6111File(file)` | `[]` |
| `validateForm6111File(buffer)` | `[]` |

Round-trip validation passes both on the result object and on the raw
windows-1255 Buffer (via the `iconv-lite` decoder).

---

## Constraints honoured

- [x] <500 LOC across new files (479 actual)
- [x] iconv-lite for windows-1255 (already installed)
- [x] `registerXxxRoutes(app, { supabase, audit, requirePermission })` factory
- [x] Defensive Supabase reads (zeros on missing tables)
- [x] `node --check` clean on all three files
- [x] No commits made
- [x] Header A100-style, detail rows, trailer totals (record types A10/B20/Z99)
- [x] JSON, fixed-width, XML envelope outputs
- [x] Permissions `tax-annual:export` / `tax-annual:create`
- [x] Upserts into `annual_tax_reports` with `form_type='6111'`, `status='submitted'`
