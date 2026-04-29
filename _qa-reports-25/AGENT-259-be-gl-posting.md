# AGENT-259 — Backend GL Auto-Posting Audit

**Agent:** 259 (Backend #4)
**Date:** 2026-04-29
**Scope:** Verify that every business action that hits the General Ledger is wired through to a real journal-entry write.

---

## TL;DR

The system has **two parallel GL engines** and **near-zero auto-posting wiring**. Almost every revenue, payment, payroll, and FX action that should produce a journal entry currently writes only to the operational subledger (e.g. `accounts_receivable`, `ap_payments`, `payroll_slips`) and **never** persists a balanced JE to the GL. Only one path — fixed-asset depreciation in `oracle-financial-core.ts` — actually writes to `gl_journal_entries`.

| Required JE Source | Status | Posting Path |
|---|---|---|
| AR Invoice issue | MISSING | helper exists, no caller |
| AP Invoice approve / 3-way match | MISSING | helper exists, no caller |
| AR Cash receipt (`/ar/:id/collect`) | MISSING | no helper, no posting |
| AP Payment (`/ap/:id/pay`) | MISSING | no helper, no posting |
| Payroll run (`/run-payroll/:period`) | MISSING | no posting; PAYROLL_ACCRUAL template unused |
| Depreciation | OK | `oracle-financial-core.ts:1398-1493` writes to `gl_journal_entries` |
| COGS at delivery / inventory issue | MISSING | helper exists (`createMaterialIssuePosting`), no caller |
| Goods receipt (PO matching) | MISSING | helper exists (`createGoodsReceiptPosting`), no caller |
| FX revaluation / realised FX gain–loss | MISSING | template exists, no scheduled run |
| Bank reconciliation differences | MISSING | `/bank-reconcile` updates `bank_transactions.matched` only |
| Petty cash reimbursement | MISSING | builds JE shape, never persists |
| Cost-allocation runs | MISSING | builds JE shape, never persists |
| Inter-company eliminations | MISSING | `generateEliminations()` returns objects, no consumer |
| Period close / year-end | DESIGNED ONLY | `YEAR_END_CLOSE` template exists, no executor |

---

## 1. Two Disconnected GL Engines

### 1.1 In-memory JS engine (onyx-procurement)
**Path:** `onyx-procurement/src/gl/journal-entry.js` (1012 lines)

Pure-JS `createBook()` factory with COA, periods, FX adapter, 11 templates (`MONTHLY_RENT_ACCRUAL`, `DEPRECIATION`, `PAYROLL_ACCRUAL`, `BANK_SERVICE_FEES`, `FX_REVALUATION`, `INVENTORY_ADJUSTMENT`, `VAT_OFFSET`, `LOAN_PAYMENT`, `YEAR_END_CLOSE`, `ACCRUED_INTEREST_INCOME`, `PREPAID_INSURANCE_AMORT`).

- **In-memory only** — `entries = new Map()`. No SQL persistence.
- **No `journal_entries` / `gl_entries` table** in any of `001-007` migrations under `onyx-procurement/supabase/migrations/`.
- **Importers in entire repo:** 3 files — `gl/journal-entry.js` (self), `intercompany/ic-engine.js` (only references the *concept* in a comment, doesn't `require` it), `contracts/contract-manager.js` (false positive — `applyTemplate` is a contract-template helper, unrelated).
- **Conclusion:** the engine has *zero real callers*. Templates and `applyTemplate('PAYROLL_ACCRUAL', ...)` are never invoked from any payment/payroll/invoice flow.

### 1.2 Postgres-backed TS engine (api-server)
**Path:** `api-server/src/routes/oracle-financial-core.ts:583` (`POST /journal-entry`) plus tables `gl_journal_entries`, `gl_journal_lines`, `gl_periods`, `gl_accounts_master`.

- Endpoint accepts a draft JE, validates balance, writes to `gl_journal_entries`/`gl_journal_lines`, creates period rows on demand.
- **Caller scan:** `grep -r "/journal-entry\|gl_journal_entries\|gl_journal_lines"` in `api-server/src/routes/` returns ONLY `oracle-financial-core.ts` (defines it) and `finance-enterprise.ts` (provides CRUD over the lines table). No business action route invokes it.

### 1.3 Posting helpers library (used by nobody)
**Path:** `api-server/src/lib/posting-engine.ts`

Exports balanced-JE builders:
- `createGoodsReceiptPosting()` — DR Inventory, CR AP (lines 149-205)
- `createMaterialIssuePosting()` — DR WIP, CR Raw Materials (lines 208-262)
- `createArInvoicePosting()` — DR AR, CR Revenue, CR VAT Payable (lines 265-309)
- `createApInvoicePosting()` — DR AP, CR COGS, CR VAT (lines 312-348). NB: signs are inverted from a real AP entry — labelled "תשלום ספק" but sits on the debit side, while COGS sits on credit. Bug if/when wired.

**Caller scan:** `grep -rln "posting-engine\|createArInvoicePosting\|createApInvoicePosting\|createGoodsReceiptPosting"` over `api-server/src/`, `onyx-procurement/`, `payroll-autonomous/`, `techno-kol-ops/` — **zero importers of `posting-engine.ts`**. Pure dead code.

---

## 2. Per-Event Audit

### 2.1 Invoice issue (AR)
**Required:** DR 1200 AR / CR 4000 Revenue / CR 2300 VAT Payable.

- **`onyx-procurement/src/pipeline/orchestrator.js:181`** — `'invoice.issue'` declares `effects: [..., { type: 'post_to_gl' }, ...]`.
- **Executor (`executeOrchestration` lines 270-298):** simply pushes `{ type: effect.type, status: 'executed' }` to `result.effects_executed` and returns. **`post_to_gl` is never dispatched to a handler.** No switch statement, no effect registry. Pure stub.
- **`api-server/src/routes/ar-enterprise.ts:89` (`POST /ar`):** inserts into `accounts_receivable` only. No call to `/journal-entry`, `posting-engine`, or `gl_journal_entries`.
- **`api-server/src/routes/ar-enterprise.ts:105` (`PUT /ar/:id` with status='approved'):** sets `approved_by/approved_at`. No GL.

### 2.2 Payment receive (AR)
**Required:** DR 1100 Bank / CR 1200 AR.
- **`api-server/src/routes/ar-enterprise.ts:200` (`POST /ar/:id/collect`):** inserts `ar_receipts`, recomputes `paid_amount` and `status` on `accounts_receivable`. **No GL JE created.**
- **`/ar-receipts` POST (line 166):** identical pattern — no GL.
- **`onyx-procurement/src/pipeline/orchestrator.js:190` (`invoice.register_payment`):** effects list does NOT even contain `post_to_gl` — only `update_invoice_balance`, `audit`. So the orchestrator design itself omits cash receipt posting.

### 2.3 AP invoice approve & payment
**Required:** DR Expense/Inventory / CR 2100 AP at approve; DR 2100 AP / CR 1100 Bank at pay.
- **`api-server/src/routes/ap-enterprise.ts:86` (`POST /ap`):** insert into `accounts_payable` only.
- **`api-server/src/routes/ap-enterprise.ts:101` (`PUT /ap/:id`) status='approved':** sets approval columns; **no JE.**
- **`api-server/src/routes/ap-enterprise.ts:158` (`POST /ap/:id/pay`):** inserts `ap_payments`, updates `accounts_payable.paid_amount`. **No JE.**

### 2.4 Payroll run
**Required:** DR 6100 Wages / CR 2150 Net Payable / CR 2150 Withholdings + Employer Cost.
- **`api-server/src/routes/attendance-payroll-engine.ts:532-701` (`POST /run-payroll/:period`):** computes per-employee gross/net/employer cost, inserts `payroll_slips`, updates `payroll_runs`. **No GL JE created.**
- **`onyx-procurement/src/payroll/wage-slip-calculator.js`:** zero references to journal/ledger/posting/gl.
- **`payroll-autonomous/`:** entire workspace has zero references to journal_entries/gl/posting outside test fixture mock data.
- **PAYROLL_ACCRUAL template (`journal-entry.js:292-313`):** never applied.

### 2.5 Depreciation — ONLY WORKING PATH
- **`api-server/src/routes/oracle-financial-core.ts:1398-1493` (`POST /calculate-depreciation`):**
  - Iterates `fixed_assets_register`, computes monthly straight-line.
  - **Builds balanced JE: DR `gl_expense_account || 6500`, CR `gl_depreciation_account || 1590`.**
  - Inserts directly into `gl_journal_entries` and `gl_journal_lines` with `auto_generated=true, status='posted'`.
- **Gap:** no scheduler / cron triggers this — it's a manual `POST` route. Found nothing in `api-server/src/routes/admin-cron-triggers.ts` or elsewhere that schedules it.
- **`onyx-procurement/src/finance/fixed-assets.js`:** standalone depreciation engine with 63 mentions of the word "depreciation" but **0 references to journal/ledger/posting/gl**. So the JS-side fixed-asset module produces values but doesn't post.

### 2.6 COGS / Inventory Issue
**Required:** DR 5000 COGS / CR 1300 Inventory at delivery.
- **`api-server/src/lib/posting-engine.ts:208 createMaterialIssuePosting()`** — never called.
- **No COGS-on-delivery hook anywhere in `delivery`/`logistics`/`shipments` modules.**
- **Inventory adjustments** (`onyx-procurement/src/reports/inventory-valuation.js`): valuation only, no posting.

### 2.7 FX revaluation / realised FX
**Required:** DR/CR 7100 FX Gain/Loss against revalued AR/AP/cash account.
- **`onyx-procurement/src/fx/fx-engine.js`:** 15 occurrences of fx terminology, **zero of journal/ledger/posting/gl**. No revaluation runner.
- **`FX_REVALUATION` template in `journal-entry.js:328-354`** — never invoked.
- **No scheduled period-end revaluation** anywhere.
- **Realised FX gain on AR/AP settlement:** `/ar/:id/collect` and `/ap/:id/pay` ignore `currency` vs base FX delta entirely. No gain/loss line ever computed.

### 2.8 Bank reconciliation
- **`oracle-financial-core.ts:1322` (`POST /bank-reconcile`):** matches `bank_transactions` to `ap_payments` / `ar_receipts` and inserts a `bank_reconciliation` row. **No JE for unreconciled bank fees, FX adjustments, or interest.** Bank service fees template (`BANK_SERVICE_FEES` line 315) is unused.

### 2.9 Inter-company eliminations
- **`onyx-procurement/src/intercompany/ic-engine.js:919 generateEliminations()`:** returns array of JE-shaped objects with Dr/Cr lines. **Comment line 917**: `Returns an array of journal-entry objects with Dr/Cr lines` — but no caller persists them; the consolidation agent is referenced only in a comment.

### 2.10 Cost allocation
- **`onyx-procurement/src/costing/allocation-engine.js:687-725`:** builds `journal_entries` array attached to each run record (memory only). No persistence to GL.

### 2.11 Petty cash
- **`onyx-procurement/src/cash/petty-cash.js:80-90`:** declares per-category GL accounts (`OFFICE→5110`, `TRAVEL→5210`, …) and `GL_ACCOUNTS` constants. **Zero matches** for `journal-entry`/`book.post`/`addLine`. Reimbursements never post.

### 2.12 Period close / year-end
- **`YEAR_END_CLOSE` template (`journal-entry.js:416-441`)** — single-line stub (4000↔3500), already flagged as "stub" in `_qa-reports-25/AGENT-229-year-end-close.md` and `AGENT-163-year-end-close.md`. No executor. No `period_locks` adapter wired (default is `() => false`).

---

## 3. Wiring-Spec vs. Reality

`onyx-procurement/src/pipeline/state-machines.js` declares trigger side-effects:
- Line 93: invoice `draft → issued` triggers `{ action: 'post_to_gl', params: {} }`
- Line 255: payment posted triggers `post_to_gl`
- Line 349: `journal_entry draft → posted` triggers `post_to_gl`

`onyx-procurement/src/pipeline/workflow-flows.js:84` lists `post_to_gl` as a results action for the Sales→Cash flow.

**None of these strings is implemented.** The orchestrator effect handler is a no-op printer (orchestrator.js:287-289). There is no event bus consumer that listens for `invoice.issued` / `payment.registered` / etc. and invokes the GL.

---

## 4. Gaps Summary by Severity

### P0 — Blocks any real accounting close
1. AR invoice issue → no JE
2. AP invoice approve → no JE
3. AR cash receipt → no JE
4. AP payment → no JE
5. Payroll run → no JE
6. Goods receipt (PO match) → no JE
7. COGS at delivery → no JE

### P1 — Required for monthly close & audit
8. FX revaluation period-end run missing
9. Realised FX gain/loss on settlement missing
10. Bank fees/interest auto-posting missing
11. IC elimination JEs not persisted
12. Period-lock adapter (`periods.isLocked`) hard-coded to false
13. Two competing GL engines (JS in-memory + Postgres) — no chosen system of record

### P2 — Design / dead code
14. `posting-engine.ts` has zero importers — dead module
15. `journal-entry.js` has zero importers outside its own file — dead module
16. `orchestrator.executeOrchestration` is a logging stub — needs a real effect dispatcher mapping `post_to_gl` → SQL insert
17. `YEAR_END_CLOSE` template is a single-line stub
18. `createApInvoicePosting()` line 312-348 has inverted DR/CR for COGS — would post backwards if ever wired

---

## 5. Recommended Wiring (Single-Line Spec)

For each of the seven P0 events, add a `await postJE({source, sourceId, lines})` call right after the subledger insert/update:

| Hook (file:line) | New JE source | DR / CR |
|---|---|---|
| `ar-enterprise.ts:89` (after AR insert, when status≠draft) | `AR_INVOICE` | DR 1200 / CR 4000 / CR 2300 |
| `ap-enterprise.ts:101` (status='approved') | `AP_INVOICE` | DR 5xxx/6xxx (per `gl_account`) / CR 2100 / DR 2310 |
| `ar-enterprise.ts:200` (`/ar/:id/collect`) | `AR_RECEIPT` | DR 1100 / CR 1200 |
| `ap-enterprise.ts:158` (`/ap/:id/pay`) | `AP_PAYMENT` | DR 2100 / CR 1100 |
| `attendance-payroll-engine.ts:680` (after `payroll_runs` update) | `PAYROLL_RUN` | DR 6100 / CR 2150 (split by net+withhold+employer) |
| GRN/PO-match route (does not exist; need new) | `GOODS_RECEIPT` | DR 1300 / CR 2100 |
| Delivery/shipment confirm route | `COGS` | DR 5000 / CR 1300 |

All of these can re-use `gl_journal_entries`/`gl_journal_lines` schema and `posting-engine.ts:createXPosting()` builders (after fixing the AP DR/CR bug at line 312).

A single FX revaluation cron at month-end and a single bank-fee posting hook at reconciliation close P1.

---

## 6. Files Referenced (absolute paths)

- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/gl/journal-entry.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/pipeline/orchestrator.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/pipeline/state-machines.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/pipeline/workflow-flows.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/finance/fixed-assets.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/payroll/wage-slip-calculator.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/fx/fx-engine.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/cash/petty-cash.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/costing/allocation-engine.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/intercompany/ic-engine.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/src/payments/payment-run.js`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/api-server/src/routes/oracle-financial-core.ts`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/api-server/src/routes/ar-enterprise.ts`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/api-server/src/routes/ap-enterprise.ts`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/api-server/src/routes/attendance-payroll-engine.ts`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/api-server/src/lib/posting-engine.ts`
- `C:/Users/kobi/OneDrive/kobi/המערכת 2026  KOBI EL/.claude/worktrees/objective-merkle-40ff93/onyx-procurement/supabase/migrations/` (no journal_entries/gl_entries DDL present)

---

## 7. Verdict

**The system can record subledger movements but cannot produce a balanced trial balance from real transactional data.**
Of 14 GL-bound business events, **1 is wired (depreciation), 13 are missing**.
Two well-built GL primitives (`onyx-procurement/src/gl/journal-entry.js` and `api-server/src/lib/posting-engine.ts`) exist as orphans with zero callers.
The orchestrator that *should* dispatch `post_to_gl` is a logging stub.
Closing this gap is a P0 blocker for any GAAP/IFRS-compliant close.
