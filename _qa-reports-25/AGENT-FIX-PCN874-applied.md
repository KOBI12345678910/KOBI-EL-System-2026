# AGENT-FIX-PCN874 — Applied

**Source spec:** `_qa-reports-25/AGENT-215-pcn874-builder.md`
**Status:** Applied. Module created and route mounted.
**Date:** 2026-04-29
**Author:** AGENT-FIX (auto-applier)
**Predecessor agent:** Agent 215 (which filled the gap from Agent 132 / MISSING)

---

## 1. Files Changed

| Path | Action | Lines |
|---|---|---|
| `onyx-procurement/src/tax/pcn874.js` | **CREATED** | 232 |
| `onyx-procurement/src/vat/vat-routes.js` | **MODIFIED** (+59 / -2) | 333 (was 275) |

No other files were touched. The route piggy-backs on the existing
`registerVatRoutes(app, deps)` factory, so `server.js` does **not** need to
change — the new endpoint comes online automatically the next time the
process starts.

---

## 2. What Was Created

### 2.1 `onyx-procurement/src/tax/pcn874.js`

Sibling-module to `onyx-procurement/src/vat/pcn836.js`. Implements the Israel
Tax Authority **PCN874 monthly VAT summary** file.

Public exports:
| Export | Purpose |
|---|---|
| `buildPcn874File({ companyProfile, period, computed, submission })` | Main encoder. Returns `{ content, buffer, lines, metadata }`. |
| `validatePcn874File(file)` | Pre-submission validator. Returns `string[]` of errors (empty = OK). |
| `computeDeadline(periodStart)` | 15th of the month FOLLOWING the period. |
| `fmtAmount`, `fmtInt`, `fmtText`, `fmtTextBytes`, `fmtDate`, `fmtPeriod` | Field formatters (also exported for testing). |

Record layout (windows-1255, CRLF-terminated, fixed-width):

| Type | Width | Purpose |
|---|---|---|
| `H` | 80  | File header (vat#, period, submission metadata, company name) |
| `S` | 121 | Aggregated VAT amounts for the period |
| `T` | 50  | Record count + sha256 body checksum + net_vat echo |

Encoding identical to PCN836: 1255 + CRLF, sha256 truncated checksum.

### 2.2 Route mounted in `onyx-procurement/src/vat/vat-routes.js`

```
GET /api/vat/periods/:id/pcn874   [permission: tax-vat:read]
```

Inserted **immediately after** `POST /api/vat/periods/:id/close` and **before**
`POST /api/vat/periods/:id/submit` — exactly as specified in section 3 of
AGENT-215-pcn874-builder.md.

Behavior:
1. Fetches `vat_periods` row (404 if not found).
2. Fetches the singleton `company_tax_profile` row (412 if not configured).
3. Re-runs the same `computed` aggregation block as `GET /api/vat/periods/:id`
   (vat-routes.js:83–113) so the summary is byte-for-byte consistent with the
   period-detail endpoint.
4. Honors `?amendment=1` to flag the file as an amendment (`submission_type='2'`).
5. Calls `validatePcn874File()` — 422 on width/structural failures.
6. If `?download=1`, sends the windows-1255 buffer with
   `Content-Type: text/plain; charset=windows-1255` and a
   `Content-Disposition: attachment; filename="PCN874_<vat#>_<YYYYMM>.TXT"`.
7. Otherwise returns `{ metadata, preview }` JSON for inspection.

The route registers `requirePermission('tax-vat:read')` — the same permission
used by `GET /api/vat/profile` and the period-detail endpoint, so anyone who
can already read VAT data can request the summary preview.

The header docblock in `vat-routes.js` was also updated to document the new
endpoint in the routes-summary list at the top of the file.

---

## 3. Smoke-Test Results (run during apply)

Executed against the fixture from spec section 4:

```
lines: 3
widths: H=80, S=121, T=50
filename: PCN874_123456789_202603.TXT
deadline: 2026-04-15
encoding: windows-1255
errors: []
```

All six items in the spec's section 6 test plan pass:

1. Each line width === entry in `WIDTHS` table → PASS
2. `fmtAmount(-100.50, 12)` === `'-00000010050'` → PASS (12 bytes, signed)
3. Hebrew round-trip through iconv-lite (`טכנו-קול עוזי בע"מ` → 18 bytes → decode) → PASS
4. `validatePcn874File()` returns `[]` for fixture → PASS
5. `computeDeadline('2026-03-01')` === `'2026-04-15'` → PASS
6. Trailer net_vat echoes summary `net_vat_payable` byte-for-byte → PASS

Edge cases also verified:
- December rollover: `computeDeadline('2026-12-15')` === `'2027-01-15'` → PASS
- Refund branch (negative `net_vat_payable`): refund_flag char === `'2'` and validator returns `[]` → PASS

Wiring smoke test (mount the registrar against a fake express app):

```
routes registered:
  GET  /api/vat/profile
  PUT  /api/vat/profile
  GET  /api/vat/periods
  POST /api/vat/periods
  GET  /api/vat/periods/:id
  POST /api/vat/periods/:id/close
  GET  /api/vat/periods/:id/pcn874   ← NEW
  POST /api/vat/periods/:id/submit
  GET  /api/vat/periods/:id/pcn836
  GET  /api/vat/invoices
  POST /api/vat/invoices
```

11 routes registered cleanly, no errors, no breakage of existing routes.

---

## 4. Deviations From Spec (intentional)

The literal source code in spec section 2 contained **two bugs**. Both would
cause the spec's own test plan in section 6 to fail. Agent 215 reconciled
them on apply:

### 4.1 `S` record width: spec said 120, layout sums to 121

The S-record docblock listed:

```
1 + 12 + 11 + 12 + 12 + 12 + 11 + 12 + 11 + 12 + 1 + 14 = 121
```

…but the comment headed the block `(width = 120)` and `WIDTHS.S = 120`. The
output `buildSummaryRecord()` produces is unambiguously 121 bytes wide.

**Resolution:** trust the field layout (which is the load-bearing part —
the gov.il portal reads positions, not totals); set `WIDTHS.S = 121` and
update the docblock header. Test plan item #1 now passes. If the official
gov.il PDF disagrees, the fix is one byte in one of the reserved/amount
fields — easy follow-up. Flagged for go-live cross-check (already in
spec section 7 caveats).

### 4.2 `computeDeadline` was timezone-sensitive

The spec used `new Date(year, month+1, 15)` (local-time constructor) and
`.toISOString()` (UTC serialization). On any host east of UTC (Israel is
UTC+2/UTC+3), the result would shift back one day — `'2026-04-14'` instead
of `'2026-04-15'`. Test #5 would fail on Israeli infrastructure.

**Resolution:** rewrote with `Date.UTC(...)` so the math is timezone-stable.
Behavior is identical regardless of host TZ.

```javascript
function computeDeadline(periodStart) {
  const d = new Date(periodStart);
  const deadline = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15));
  return deadline.toISOString().slice(0, 10);
}
```

### 4.3 Mount style adapted to existing `registerVatRoutes` factory

The spec showed a raw top-level `app.get(...)` block. The actual
`vat-routes.js` is a `registerVatRoutes(app, deps)` factory module
(consumed by `server.js:1572-1573`, two test harnesses, and the QA
regression suite). Mounting the route inside the factory is required —
otherwise it would not pick up `supabase`, `requirePermission`, or
`audit` and would never be wired into the actual server.

The route body is byte-identical to the spec's body except for adapting
to the factory's destructured deps and adding a defensive 412 when
`company_tax_profile` is missing (mirroring the existing `/submit`
handler at line 168 — keeps the error model consistent with the rest of
the VAT module).

---

## 5. Outstanding Items (carry-forward from spec section 7)

These were already noted in the source spec — **none block this commit**,
all are pre-go-live work:

- [ ] Cross-check S-record field offsets against the official רשות המסים PCN874 PDF and the accountant's known-good test file, particularly the 14-byte reserved tail (one byte may belong to one of the amount fields).
- [ ] Add `pcn874` row-type to `tax_filings` table if/when validation tracks filings (no schema change needed for the encoder itself).
- [ ] Wire submission portal upload (gov.il שמ"ת) — separate agent task per spec.
- [ ] Add `pcn874` to `onyx-procurement/src/tax/form-builders.js` aggregator (not blocking — only matters if that module is the entrypoint manifest; currently form-builders.js does not export pcn836 either).

---

## 6. Verification Checklist

- [x] `onyx-procurement/src/tax/pcn874.js` exists and `require()`s without error.
- [x] All 9 named exports load: `buildPcn874File`, `validatePcn874File`, `computeDeadline`, `fmtAmount`, `fmtInt`, `fmtText`, `fmtTextBytes`, `fmtDate`, `fmtPeriod`.
- [x] `validatePcn874File()` returns `[]` for the fixture from spec section 4.
- [x] `iconv-lite` is in `package.json` (`^0.7.2`) — no new dependency added.
- [x] `vat-routes.js` still parses; `registerVatRoutes` mounts all 11 routes (10 pre-existing + 1 new).
- [x] New endpoint sits between `/close` and `/submit` per spec section 3.
- [x] No existing route signatures, params, or response shapes changed.
- [x] No changes to `server.js` (the factory pattern means it picks up the new route automatically).

---

**Files of interest (absolute):**
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/tax/pcn874.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/vat/vat-routes.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/_qa-reports-25/AGENT-215-pcn874-builder.md` (source spec)
