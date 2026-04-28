# AGENT-163 — Year-End Close (סגירת שנה / דו"ח שנתי)

**Date:** 2026-04-29
**Agent:** 163
**Worktree:** `objective-merkle-40ff93`
**Scope:** Trace year-end close pipeline → trial balance → adjustments → close → financial statements → tax filings → roll-forward
**Verdict:** **PARTIAL** — primitives exist (TB, BS, P&L, Form 6111/1320/1301/30א, fiscal_years), but the orchestrating workflow ("close fiscal year" command) is missing. Compute endpoint stops at gross profit; close/lock/roll-forward are not wired end-to-end.

---

## 0. Pipeline overview

```
GL lines  ─►  Trial Balance  ─►  Adjusting JEs  ─►  YEAR_END_CLOSE JE  ─►  Statements  ─►  Form 6111 / 1320 / 1301 / 30א  ─►  Roll-Forward
   ●            ●                  ◐                    ◐                      ●                 ◐                                ✗
```

Legend: ● = implemented, ◐ = partial, ✗ = missing.

---

## 1. Step-by-step trace

### Step 1 — Trial Balance (מאזן בוחן)

**Implementation:** `onyx-procurement/src/gl/financial-statements.js:618-723` — pure function `trialBalance(period, opts)`.

- **Inputs:** `opts.glLines[]` (inception-to-date), optional `opts.priorGlLines`, optional `opts.entities` (consolidation).
- **Logic:** splits lines into opening (date < period.from) + movements (in-period); groups by account; classifies via `classify()` into sections (assets, liabilities, equity, revenue, cogs, opex, finance, tax); computes `closing.debit/credit/balance`; subtotals by section; balanced flag with `BALANCE_TOLERANCE = 0.02`.
- **Hebrew labels:** `LABELS.trialBalance = { he: 'מאזן בוחן' }` at line 95.
- **API exposure:** **NO direct REST route** in `onyx-procurement` for `/api/trial-balance`. Indirectly via `reportPack` (line 1497) bundle.

**Gaps:**
- No HTTP endpoint to retrieve the TB on demand by fiscal year.
- No persistence — TB is regenerated from `glLines` every call; no `trial_balance_snapshots` table.
- No diff/variance vs prior-year TB built-in.

---

### Step 2 — Adjusting / Closing entries (יומני התאמות)

**Implementation:** `onyx-procurement/src/gl/journal-entry.js`

| Template | Line | Purpose |
|---|---|---|
| `DEPRECIATION` | 278-290 | Monthly fixed-asset depreciation (Dr 6500, Cr 1590) |
| `PAYROLL_ACCRUAL` | 292-313 | Salary accrual at period end |
| `FX_REVALUATION` | 328-354 | §9 פקודת מס הכנסה — FX gain/loss |
| `INVENTORY_ADJUSTMENT` | 356-379 | Count-up / write-down |
| `VAT_OFFSET` | 381-398 | Periodic VAT closeout |
| `ACCRUED_INTEREST_INCOME` | 443-454 | Interest receivable |
| **`YEAR_END_CLOSE`** | **416-441** | **Profit/Loss → Retained Earnings (Dr 4000 / Cr 3500 if profit; reverse if loss)** |

**Period-locking:** `createBook({ periods: { isLocked(periodKey) } })` at line 487, 496 — adapter pattern only; **no concrete implementation** binding to a fiscal-year status table. Default `isLocked() => false` (line 496). Enforced on edit/post/reverse at lines 675, 731, 744.

**Gaps:**
- `YEAR_END_CLOSE` template is a **single-account collapse** (only 4000 → 3500). Real close must zero out **all** revenue (4xxx), COGS (5xxx), opex (6xxx), finance (7xxx, 8xxx), and tax (9xxx) accounts to "Income Summary" then to retained earnings. Current template is a stub.
- No `REVERSING_ENTRY` template — accruals booked at year-end can't be auto-reversed on day 1 of new year.
- No `TAX_PROVISION` template — corporate tax accrual (23% × pre-tax) is computed virtually inside `balanceSheet` at line 884-912 (synthetic `2190` accrued tax payable) but never posted to GL.
- No `ADJUSTING_ENTRY_BATCH` orchestration — bookkeeper must post each one manually.
- `periods.isLocked` is **never wired** to `fiscal_years.status` from the DB.

---

### Step 3 — Close fiscal year (סגירת שנה)

**DB schema:** `onyx-procurement/supabase/migrations/005-annual-tax-module.sql:143-161`

```sql
CREATE TABLE fiscal_years (
  year, start_date, end_date,
  status TEXT CHECK (status IN ('open','closing','closed','audited','submitted')),
  closed_at, closed_by,
  total_revenue, total_cogs, gross_profit, total_expenses,
  net_profit_before_tax, income_tax, net_profit_after_tax
);
```

**Compute endpoint:** `POST /api/fiscal-years/:year/compute` at `onyx-procurement/src/tax/annual-tax-routes.js:185-233`
- Sums `customer_invoices.net_amount` (revenue) and `tax_invoices.net_amount WHERE direction='input' AND is_asset=false` (COGS).
- Upserts `fiscal_years` with `status='open'`.
- **Sets `gross_profit = revenue - cogs` AND `net_profit_before_tax = revenue - cogs`** (line 219). **OpEx is not subtracted.**

**Alternate stack:** `api-server/src/routes/financial-statements.ts:82-92` — `POST /api/financial-statements/close-period/:periodId` flips `financial_periods.status = 'closed'`. This is a **different table** (`financial_periods`) on a different service, not aligned with `fiscal_years`.

**Gaps (CRITICAL):**
- **No `POST /api/fiscal-years/:year/close` endpoint.** The `closing`/`closed`/`audited`/`submitted` states in the CHECK constraint have no transition logic. `closed_at`/`closed_by` are never written.
- `fiscal_years.total_expenses`, `income_tax`, `net_profit_after_tax` are declared but **never populated** by `compute`.
- No event emission. `packages/shared-events/topic-map.js:196` defines `'ledger.year_end_closed'` but no producer wires it.
- No `period_lock` / `fiscal_year_closed` table; back-dating into a "closed" year is **not blocked at the DB or service layer**.
- Stage transition `open → closing → closed → audited → submitted` is documented in CHECK but unimplemented.

---

### Step 4 — Financial statements (דוחות כספיים)

**Implementation:** `onyx-procurement/src/gl/financial-statements.js` (1716 lines, single file).

| Statement | Function | Line | Israeli alignment |
|---|---|---|---|
| Trial Balance | `trialBalance` | 618 | מאזן בוחן ✓ |
| Balance Sheet | `balanceSheet` | 741 | מאזן ✓ — bilingual, current/non-current split, accrued tax synthesis at 884-912 |
| Income Statement | `incomeStatement` | (sec. 8) | דו"ח רווח והפסד ✓ — 23% corporate tax bridge |
| Cash Flow | `cashFlowStatement` | (sec. 9) | תזרים מזומנים — שיטה עקיפה ✓ |
| Equity Changes | `equityStatement` | 1401 | דו"ח על השינויים בהון העצמי ✓ — opening + movements (issue/dividend/NI) + closing |
| Bundled pack | `reportPack` | 1497 | All five + cross-checks (TB balanced, BS balanced, CF reconciled) |

**Constants:** `CORPORATE_TAX_RATE = 0.23` (line 84, since 2018), `BALANCE_TOLERANCE = 0.02` (line 87), `BASE_CURRENCY = 'ILS'` (line 90).

**Alternate route layer:** `api-server/src/routes/financial-statements.ts`
- `GET /api/financial-statements/balance-sheet/:period` (line 175)
- `GET /api/financial-statements/income-statement/:period` (line 209)
- `GET /api/financial-statements/cashflow/:period` (line 255) — **simplified estimate** (`depreciation = fixed_asset * 0.1`, `investingCashFlow = -fixed_asset * 0.05`, `financingCashFlow = long_term_liability * 0.02` — heuristics, not GL-derived)
- `GET /api/financial-statements/ratios/:period` (line 285)
- `GET /api/financial-statements/dashboard` (line 326)

**Gaps:**
- `api-server` route uses its own `balance_sheet_items`/`income_statement_items` tables (manual entry). It does NOT consume the `financial-statements.js` engine in `onyx-procurement`. Two parallel sources of truth.
- No PDF/Excel export of the statement pack to file (only CSV section in `financial-statements.js:1565`).
- No comparative-year side-by-side view at the route layer (engine supports `comparativeDate`, but not exposed).
- No XBRL output for ת.ז דוחות כספיים filing.

---

### Step 5 — Tax filings (טפסים שנתיים)

**Form generation:** `POST /api/annual-tax/:year/forms/:type/generate` at `onyx-procurement/src/tax/annual-tax-routes.js:237-315`
- Validates `formType ∈ {1320, 1301, 6111, 30a}`.
- Loads `company_tax_profile` (412 if missing) + `fiscal_years` row (412 if not computed first).
- Hard-codes `corporate_tax = profit_before_tax × 0.23` at line 261.
- Dispatches to `form-builders.js`.
- Upserts `annual_tax_reports` with `status='draft'`.

| Form | Builder | Lines | Hebrew name | Status |
|---|---|---|---|---|
| **1320** — נספח רווח והפסד עסקי | `buildForm1320` | `form-builders.js:25` | דוח רווח והפסד | Implemented |
| **1301** — דוח שנתי יחיד | `buildForm1301` | `form-builders.js:146` | דוח שנתי יחיד / שותפות | Implemented (stub: `estimatedTaxLiability: 0`, `finalTaxDue: 0` at lines 193-195) |
| **6111** — דוח מתואם לצרכי מס | `buildForm6111` (form-builders.js:114) **and** full engine `src/tax/form-6111.js` (1070 lines) | both | דוח מתואם לצרכי מס | Implemented (rich engine in `tax/form-6111.js` — adjustments §17/§46 entertainment/donations/depreciation/FX) |
| **30א** — דוח יצרן | `buildForm30A` | `form-builders.js:202` | דוח יצרן (Manufacturer) | Implemented |

**XML exports:** `onyx-procurement/src/tax-exports/`
- `form-1320-xml.js`, `form-1301-xml.js`, `form-102-xml.js`, `form-126-xml.js`, `form-857-xml.js`, `vat-rashut-hamisim-xml.js`, `shv-xml.js`

**Status table:** `annual_tax_reports.status ∈ {draft, prepared, reviewed, submitted, accepted, amended}` (migration 005, line 171-172). Unique on `(fiscal_year, form_type)`.

**Gaps (HIGH):**
- **`buildForm6111` in `form-builders.js:114` is a STUB** — `totals: { totalAssets: 0, totalLiabilities: 0, ... netProfit: 0 }` are hard-zeroed (lines 132-139). The rich engine in `src/tax/form-6111.js` (which IS complete) is **not wired** into the route. The route picks the stub.
- `1301.estimatedTaxLiability` is hard-coded `0` (line 193) — no Israeli individual tax-bracket table applied.
- `1320` uses `totals.cash` from `req.body` if provided — opaque dependency.
- **No status transitions** beyond `draft` (no `/submit`, `/accept`, `/amend` route).
- **No BKMVDATA.TXT export** — required by תקנות מס הכנסה (ניהול פנקסי חשבונות), תקנה 36. Confirmed missing in `QA-AGENT-141-ANNUAL-TAX.md:166`.
- **No Form 856** (דיווח אחיד — ניכויים) export endpoint, despite CHECK constraint allowing `'856','867'`.
- No PDF rendering call from the route (`pdf_path` column declared, never written).

---

### Step 6 — Roll-forward (פתיחת שנה חדשה)

**Implementation:** **NONE.**

**Expected behavior:**
1. After `fiscal_year.status = 'closed'`, automatically:
2. Generate opening JE for new year: every BS account's `closing.balance` becomes opening of `year+1`.
3. Reset all P&L (4xxx-9xxx) accounts to zero.
4. Carry retained earnings (3500) forward.
5. Reverse year-end accruals on day 1 if marked reversing.

**Search results:**
- No `rollForward` / `roll_forward` / `openingEntry` / `carryForward` function anywhere in `onyx-procurement/src` (grep on entire src tree returned 0 hits for these terms).
- `trialBalance` at line 626 derives opening from `glLines` filtered by date — implicit, no explicit roll-forward JE is ever posted.
- `error-messages.json:459` defines `OPENING_BALANCE_MISMATCH` error code — never thrown anywhere.

**Gaps (CRITICAL):**
- No procedure to materialize opening balances as proper GL entries for the new fiscal year.
- No reversing-entries mechanism — accruals (`PAYROLL_ACCRUAL`, `ACCRUED_INTEREST_INCOME`) stay on the books indefinitely.
- No "year-1 opening" snapshot persisted — auditor cannot drill from year-2 opening back to year-1 closing entries.

---

## 2. Cross-cutting gaps

| # | Area | Severity | Detail |
|---|---|---|---|
| 1 | **Workflow orchestration** | CRITICAL | No state machine for `fiscal_years.status` transitions. `pipeline-engine.js` covers Lead→Cash, not period-close. |
| 2 | **Period locking enforcement** | CRITICAL | `periods.isLocked` adapter never bound to `fiscal_years` row in the running app. Back-dating into closed year is not blocked. |
| 3 | **Form 6111 wiring** | HIGH | Two implementations (`form-builders.js` stub vs `src/tax/form-6111.js` rich engine). Route uses the stub. |
| 4 | **OpEx in compute** | HIGH | `/api/fiscal-years/:year/compute` ignores opex/finance/tax. `net_profit_before_tax = gross_profit`. Net profit will overstate. |
| 5 | **Tax provision JE** | HIGH | Corporate tax (23%) is synthesized inside `balanceSheet` (synthetic `2190`) but never posted. P&L tax expense diverges from GL. |
| 6 | **Retained-earnings closing** | HIGH | `YEAR_END_CLOSE` template only handles `4000 ↔ 3500`. Real close must zero **all** nominal accounts (4xxx-9xxx). |
| 7 | **Reversing entries** | HIGH | Accruals never auto-reverse. |
| 8 | **BKMVDATA / 856** | HIGH | Regulatory file (תקנה 36) and 856 unified report missing. |
| 9 | **Two services, two truths** | MEDIUM | `onyx-procurement` (Express+Supabase, `fiscal_years`) vs `api-server` (TS, `financial_periods` + manual `balance_sheet_items` entry). Not reconciled. |
| 10 | **Audit log immutability** | MEDIUM | Per `QA-AGENT-141-ANNUAL-TAX.md:167`, `audit_log` accepts UPDATE/DELETE. Year-end close events not tamper-proof. |
| 11 | **Hash chain on year-end pack** | MEDIUM | No SHA256 chain over closed-year reports; auditor cannot detect post-hoc edits. |
| 12 | **PDF generation** | MEDIUM | `annual_tax_reports.pdf_path` column exists, no writer. |
| 13 | **Event emission** | LOW | `'ledger.year_end_closed'` topic defined in `topic-map.js:196`, no publisher. |

---

## 3. Source map (file:line)

| Concern | File | Line |
|---|---|---|
| Trial Balance | `onyx-procurement/src/gl/financial-statements.js` | 618 |
| Balance Sheet | `onyx-procurement/src/gl/financial-statements.js` | 741 |
| Income Statement | `onyx-procurement/src/gl/financial-statements.js` | (sec. 8) |
| Cash Flow | `onyx-procurement/src/gl/financial-statements.js` | (sec. 9) |
| Equity Statement | `onyx-procurement/src/gl/financial-statements.js` | 1401 |
| Report Pack | `onyx-procurement/src/gl/financial-statements.js` | 1497 |
| YEAR_END_CLOSE template | `onyx-procurement/src/gl/journal-entry.js` | 416 |
| Period-lock adapter | `onyx-procurement/src/gl/journal-entry.js` | 487, 496, 675 |
| `fiscal_years` table | `onyx-procurement/supabase/migrations/005-annual-tax-module.sql` | 143 |
| `annual_tax_reports` table | `onyx-procurement/supabase/migrations/005-annual-tax-module.sql` | 166 |
| `chart_of_accounts.form_6111_line` | `onyx-procurement/supabase/migrations/005-annual-tax-module.sql` | 199 |
| Compute endpoint | `onyx-procurement/src/tax/annual-tax-routes.js` | 185 |
| Form generation endpoint | `onyx-procurement/src/tax/annual-tax-routes.js` | 237 |
| Form 1320 builder | `onyx-procurement/src/tax/form-builders.js` | 25 |
| Form 6111 builder (stub) | `onyx-procurement/src/tax/form-builders.js` | 114 |
| Form 6111 engine (full) | `onyx-procurement/src/tax/form-6111.js` | 1-1070 |
| Form 1301 builder | `onyx-procurement/src/tax/form-builders.js` | 146 |
| Form 30א builder | `onyx-procurement/src/tax/form-builders.js` | 202 |
| Annual-tax dashboard UI | `onyx-procurement/web/annual-tax-dashboard.jsx` | 545, 660 |
| Alt close-period | `api-server/src/routes/financial-statements.ts` | 82 |
| Topic `ledger.year_end_closed` | `packages/shared-events/topic-map.js` | 196 |
| Action label `CLOSE_PERIOD` | `onyx-procurement/locales/action-labels.json` | 384 |

---

## 4. Recommendations

**P0 (blocking annual filing):**
1. Implement `POST /api/fiscal-years/:year/close` performing: (a) lock check on subsidiary periods, (b) post `TAX_PROVISION` JE, (c) post real `YEAR_END_CLOSE` JEs zeroing every 4xxx-9xxx account into `3500`, (d) flip status to `closed`, write `closed_at`/`closed_by`, (e) emit `ledger.year_end_closed`.
2. Wire `journal-entry.js` `periods.isLocked` adapter to query `fiscal_years.status IN ('closed','audited','submitted')`.
3. Replace `form-builders.js:114 buildForm6111` stub with delegation to `src/tax/form-6111.js` `generate6111()` engine. Pass GL trial balance + COA mapping.
4. Fix `compute` to also subtract opex/finance and to populate `total_expenses`, `income_tax`, `net_profit_after_tax`.

**P1:**
5. Add `POST /api/fiscal-years/:year/roll-forward` — generate opening JE for `year+1`, post reversing entries for flagged accruals, snapshot opening TB.
6. Add `REVERSING_ENTRY` and `TAX_PROVISION` templates to `journal-entry.js`.
7. Add status-transition routes for `annual_tax_reports`: `/prepare`, `/review`, `/submit`, `/accept`, `/amend`.
8. Implement BKMVDATA.TXT exporter (תקנה 36) and Form 856 (דיווח אחיד) under `src/tax-exports/`.

**P2:**
9. Reconcile `onyx-procurement.fiscal_years` with `api-server.financial_periods` — pick one canonical table.
10. Add SHA256 hash chain over closed-year `annual_tax_reports.payload`.
11. Render PDF for each form, populate `pdf_path`.
12. Add comparative-year side-by-side view in dashboard, exposing engine's existing `comparativeDate`.

---

**End of AGENT-163 report.**
