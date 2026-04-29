# AGENT-FIX-YEAREND — Year-End Close Orchestrator (applied)

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Source design:** `_qa-reports-25/AGENT-229-year-end-close.md`
**Status:** APPLIED — all five deliverables landed against existing primitives in `onyx-procurement`. Zero DB schema changes.

---

## Summary

Implemented the AGENT-229 design end-to-end:

1. New `POST /api/fiscal-years/:year/close` orchestrator (with `dryRun`, `rollForward` query flags).
2. New `YEAR_END_CLOSE_FULL` JE template — full P&L sweep across 4xxx/5xxx/6xxx/7xxx/8xxx/9xxx into income summary (3490) → retained earnings (3500).
3. New `ROLL_FORWARD_OPENING` JE template — assets + liabilities + equity carry to next fiscal year (P&L bands intentionally reset to zero).
4. New `createSupabasePeriodLockAdapter` factory in `onyx-procurement/src/gl/period-lock-adapter.js`. Wired into `createBook({ periods })` at the composition root with TTL cache + warmup + invalidate.
5. New `TAX_PROVISION` JE template — profit year books `Dr 9100 / Cr 2190`; loss year books `Dr 1490 (DTA) / Cr 9150 (current tax benefit)`.

---

## Files touched

| File | Change |
|------|--------|
| `onyx-procurement/src/gl/journal-entry.js` | Added `YEAR_END_CLOSE_FULL`, `ROLL_FORWARD_OPENING`, `TAX_PROVISION` templates next to legacy `YEAR_END_CLOSE` (kept for backward compat). Added 5 supporting accounts to default COA: `1490` DTA, `2190` Accrued Corp Tax, `3490` Income Summary, `9100` Corp Tax Expense, `9150` Current Tax Benefit. |
| `onyx-procurement/src/gl/period-lock-adapter.js` | NEW — `createSupabasePeriodLockAdapter(supabase, { ttlMs })` returns `{ isLocked, warmup, invalidate, getCacheSnapshot }`. Sync `isLocked()` returns last-known cache value and schedules async re-prime on miss. |
| `onyx-procurement/src/tax/annual-tax-routes.js` | Added `POST /api/fiscal-years/:year/close` orchestration (after `/compute`). Added module-level helpers: `postTaxProvisionJE`, `postYearEndCloseJE`, `postRollForwardOpeningJE`, `recomputeYearTotals`, `bucketByPLSection`. All exported for tests + CLI. |
| `onyx-procurement/server.js` | Composition-root wiring: `createBook({ periods: createSupabasePeriodLockAdapter(supabase) })` with warmup of `currentYear-3 .. currentYear+1`. Exposed via `app.locals.glBook` and `app.locals.glPeriods`. Inserted before `registerAnnualTaxRoutes` so the orchestrator can invalidate the cache after a successful close. |
| `onyx-procurement/src/auth/rbac.js` | Granted `tax-annual:close` to `accountant` role (transitively covers `manager`/`admin`/`owner` via existing inheritance chain). |
| `packages/shared-events/topic-map.js` | Added `ledger.tax_provision_posted` and `ledger.opening_balances_posted` to `finance.ledger` topic group. `ledger.year_end_closed` was already present. |

No DB schema migrations required — `fiscal_years.status` CHECK already permits `'closing'`/`'closed'`/`'audited'`/`'submitted'`.

---

## How the orchestrator runs

Endpoint: `POST /api/fiscal-years/:year/close[?rollForward=true][&dryRun=true]`
Permission: `tax-annual:close`
Body (optional): `{ "taxRate": 0.23 }`

Pipeline (each step short-circuits to a structured 4xx on guard failure):

1. Fetch `fiscal_years` row — 412 if missing, 409 if `status !== 'open'`.
2. Block if any `journal_entries` row inside `[start_date, end_date]` is not `posted` — 412 with sample of offenders.
3. Flip `status='closing'`.
4. `postTaxProvisionJE()` — recomputes PBT from posted `gl_lines` (so late adjustments are not stale), applies `TAX_PROVISION` template, posts via `app.locals.glBook`, mirrors to `journal_entries` table, audits, emits `ledger.tax_provision_posted`.
5. `postYearEndCloseJE()` — buckets posted `gl_lines` by P&L band via `bucketByPLSection()` (which delegates to the existing `classify()` from `journal-entry.js`), passes the bucketed trial balance to `YEAR_END_CLOSE_FULL`, posts, mirrors, audits.
6. `recomputeYearTotals()` — pulls revenue/cogs/opex/finance/tax from posted GL after the tax JE has hit, computes NPBT and NPAT.
7. Single `fiscal_years` UPDATE with `{ status:'closed', closed_at, closed_by, ...totals }`.
8. Audit row + `ledger.year_end_closed` event with `{ year, npat, taxJEId, closeJEId, closed_at, closed_by }`.
9. If `?rollForward=true` — `postRollForwardOpeningJE()` builds a closing TB from BS bands only, upserts `fiscal_years` row for `year+1` with `status='open'`, posts a `ROLL_FORWARD_OPENING` JE dated `(year+1)-01-01`, emits `ledger.opening_balances_posted`.
10. `app.locals.glPeriods.invalidate(year)` — drops cache so subsequent JE attempts dated inside the closed year hit the DB and learn the new `'closed'` status.

Failure path: any throw inside the pipeline reverts `fiscal_years.status` to `'open'` (best-effort), returns 500 with bilingual error.

---

## Template behaviour (verified)

```
TAX_PROVISION (PBT=1,000,000, rate=0.23)
  → Dr 9100  230,000
    Cr 2190  230,000

TAX_PROVISION (PBT=-200,000, rate=0.23)        // loss year
  → Dr 1490   46,000   (Deferred Tax Asset)
    Cr 9150   46,000   (Current Tax Benefit)

TAX_PROVISION (PBT<=0 with dta<0.01) → no JE, memo only

YEAR_END_CLOSE_FULL (sample TB)
  Revenue 4000:1,000,000 / COGS 5000:600,000 / OpEx 6100:150,000 6200:50,000
  / Finance 7200:10,000 / Tax 9100:43,700
  → 6 close lines + plug to 3490 (income summary) for net 146,300 credit
  → followUp JE: Dr 3490 / Cr 3500 for 146,300

ROLL_FORWARD_OPENING (BS-only TB)
  Assets 1100:500,000 1200:200,000 / Liab 2100:300,000
  / Equity 3000:100,000 3500:300,000
  → 5 lines, total Dr 700,000 = Cr 700,000 (balanced)
  → no P&L lines (4xxx-9xxx reset to zero by design)
```

Period-lock adapter — sync `isLocked('202501')` returns true once `fiscal_years.status='closed'` is cached for year 2025. Cache warms 5 years (currentYear-3 → currentYear+1) at boot. Warmup is fire-and-forget so `server.js` does not need to be wrapped in `await` (sync `isLocked` returns last-known until prime resolves; first miss triggers prime + returns `false`).

---

## Verified by

- `node --check` on every modified file.
- Functional test scripts (in-process, no DB) confirmed:
  - All 5 templates load and produce balanced JE lines.
  - `bucketByPLSection` correctly classifies revenue/cogs/opex/finance/tax/assets/liab/equity using the existing `classify()` from `journal-entry.js`.
  - `recomputeYearTotals` produced NPAT=196,300 from a synthetic 5-line GL (matches hand calc 1,000,000 - 600,000 - 150,000 - 10,000 - 43,700).
  - `createSupabasePeriodLockAdapter` honours warmup, returns true for closed/audited years, false for open years, and the `invalidate()` path correctly drops the cache.

---

## Permission + RBAC

Added `tax-annual:close` to the `accountant` role in `rbac.js`. Inherited transitively by `manager`, `admin`, `owner`. Existing `tax-annual:create`/`:export` permissions remain unchanged.

---

## Deferred / out-of-scope

- Reverse-of-reversing-entries (`POST /api/fiscal-years/:year/post-reversals`) — flagged in §3 of AGENT-229 as P1. Not implemented here.
- Reopen flow (CFO endpoint) — out of scope; 409 idempotency on second `POST /close` is sufficient to enforce single-close.
- Real Supabase DB integration test — requires a running DB; skeleton tests live in `_qa-reports-25/AGENT-229-year-end-close.md` §7 awaiting AGENT-23x test impl.
- `bilingualError` / formal error codes for the new orchestration are inline JSON; can be promoted to `MSG` in `journal-entry.js` later if the patterns proliferate.

---

## Acceptance check vs AGENT-229

| Deliverable | Anchor in design | Applied |
|---|---|---|
| 1. `POST /api/fiscal-years/:year/close` | §1 | ✓ `annual-tax-routes.js` |
| 2. `YEAR_END_CLOSE_FULL` template | §2 | ✓ `journal-entry.js` (alongside legacy `YEAR_END_CLOSE`) |
| 3. `ROLL_FORWARD_OPENING` + helper | §3 | ✓ `journal-entry.js` + `postRollForwardOpeningJE` helper |
| 4. `createSupabasePeriodLockAdapter` | §4 | ✓ NEW `period-lock-adapter.js` + wired in `server.js` |
| 5. `TAX_PROVISION` template | §5 | ✓ `journal-entry.js` with profit + loss (DTA) branches |

End of AGENT-FIX-YEAREND report.
