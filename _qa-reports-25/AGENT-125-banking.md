# AGENT-125 — Banking Domain Audit

**Project:** Techno-Kol Uzi ERP 2026 (worktree `objective-merkle-40ff93`)
**Scope:** `bank_accounts_master`, `bank_cards`, `bank_transactions`, `bank_loans`; Israeli bank file formats (Masav); check deposit; balance reconciliation.
**Date:** 2026-04-29
**Auditor:** Agent-125 — Banking

## Status

**PARTIAL — strong Masav exporter, dual schema for accounts/transactions, full check-register, but `bank_cards` and `bank_loans` tables do not exist; cash deposit / cheque deposit slip flow is missing.**

| Check | Result | Severity |
|-------|--------|----------|
| `bank_accounts_master` table defined | YES (oracle-financial-core.ts) | OK |
| `bank_accounts` table defined (alt schema) | YES (migration 006) | DUPLICATE |
| `bank_transactions` table defined | YES (both schemas) | DUPLICATE |
| `bank_cards` table defined | NO | HIGH |
| `bank_loans` table defined | NO | HIGH |
| Masav (מס"ב) exporter (120-char fixed-width) | YES — 824 lines | OK |
| Masav return-file parser (rejection codes) | YES | OK |
| Check register (פנקס שיקים) | YES — 1,397 lines | OK |
| Bank reconciliation engine (multi-pass) | YES — 1,043 lines | OK |
| Multi-format statement parser (CSV/MT940/CAMT.053) | YES — 1,090 lines | OK |
| Check deposit slip flow (הפקדת שיקים) | PARTIAL — tracked in check-register, no batch deposit slip generator | MEDIUM |
| Balance reconciliation API | YES — `/api/bank/auto-reconcile`, `/api/bank/summary` | OK |
| RLS hardened on bank.* tables | NO (per AGENT-09) | CRITICAL |

---

## 1. Schema findings

### 1.1 Two parallel `bank_accounts` schemas exist (DUPLICATE / DRIFT)

Two different definitions live in the codebase and reference each other inconsistently:

- **`bank_accounts_master`** — `api-server/src/routes/oracle-financial-core.ts:315-329`. Hebrew-first naming, columns: `account_number`, `bank_name`, `branch`, `account_name`, `currency`, `current_balance`, `available_balance`, `gl_account_code`, `is_default`, `status`. Used by `oracle-financial-core` generic CRUD route registry (`bank-accounts` → `bank_accounts_master`, see line 463). No FK to anything; no `bank_code` column.
- **`bank_accounts`** — `onyx-procurement/supabase/migrations/006-bank-reconciliation.sql:11-31`. More structured: `bank_code` (10/11/12/…), `branch_number`, `iban`, `swift_code`, `account_type` enum, `purpose`, `is_primary`, `current_balance`, `available_balance`, `last_statement_date`, UNIQUE on `(bank_code, branch_number, account_number)`. Used by `onyx-procurement/src/bank/bank-routes.js` and the recon engine.

This is a P0 normalization defect. The Express recon routes will write to `bank_accounts`; the `oracle-financial-core` UI (registered at `/api/finance/bank-accounts`) reads `bank_accounts_master`. Two source-of-truth balances.

**Recommendation:** keep `bank_accounts` (richer, has `bank_code`, has UNIQUE), drop `bank_accounts_master`, and re-point oracle-financial-core's CRUD registry. Add a one-shot migration that copies rows.

### 1.2 `bank_transactions` — two definitions, conflicting amount semantics

- **`onyx-procurement/supabase/migrations/006-bank-reconciliation.sql:63-92`** uses signed `amount NUMERIC(14,2)` (positive = credit in, negative = debit out). Has rich columns: `value_date`, `counterparty_name`, `counterparty_account`, `transaction_type` CHECK enum, `check_number`, `match_confidence`, `raw_data` JSONB.
- **`api-server/src/routes/oracle-financial-core.ts:332-349`** uses split `debit_amount NUMERIC(15,2)` + `credit_amount NUMERIC(15,2)`. Has `import_batch`, `imported` flag.

Two payment posting models. Reconciliation logic in `onyx-procurement/src/bank/matcher.js:65-73` assumes signed amount; `oracle-financial-core` reports cannot use the same SQL. **Severity: HIGH.**

`AGENT-09-db-integrity.md:43` already flags `bank_transactions.status` as missing CHECK enum (in the oracle-financial-core variant).

### 1.3 `bank_cards` — NOT FOUND in any migration

Searched: zero matches in `**/migrations/*.sql`. The user-task contract names this as a required table but no DDL exists. The check-register module has logic for "credit card restrictions on לקוח מוגבל חמור" (`onyx-procurement/src/finance/check-register.js:48`) but no card master table. **Severity: HIGH** — blocks card-issuing/management UI and binding card transactions to GL.

A `credit-card-processing.tsx` page exists at `erp-app/src/pages/finance/credit-card-processing.tsx` but it points at no backing table.

### 1.4 `bank_loans` — NOT FOUND in any migration

`bank_accounts.account_type` includes `'loan'` as an enum value (migration 006:21) but no separate `bank_loans` table for amortization, schedule, principal/interest split, balloon, early-payoff. A UI page exists at `erp-app/src/pages/finance/loan-analysis.tsx` but no DDL or API. **Severity: HIGH.**

---

## 2. Israeli Masav (מס"ב) — file format

`onyx-procurement/src/bank-files/masav-exporter.js` (824 lines, zero deps) is the strongest piece in this domain.

- **120-char fixed-width** records — Header (`'1'`), Detail (`'2'`), Trailer (`'9'`). Field positions documented in-code (lines 207-240). All numeric right-padded with `'0'`, alpha left-padded with `' '`.
- **Amounts in aggurot** (1/100 ILS), 11-digit zero-padded, validated against 99,999,999.99 ceiling (line 455).
- **Encodings:** `'ascii'` (default — Hebrew transliterated via `HE_TRANSLIT` map line 136-141) or `'cp862'` (legacy mainframe pass-through).
- **Israeli bank codes** seeded for 17 banks (lines 56-74) — Leumi 10, Discount 11, Hapoalim 12, Igud 13 (marked inactive — correct, Igud merged into Mizrahi 2020), Mercantile 17, Mizrahi-Tfahot 20, First International 31, Yahav 04, Postal 09, Otzar HaChayal 14, UBank 26, Arab-Israel 34, Massad 46, Poalei Agudat 52, Jerusalem 54.
- **Israeli ID Luhn check** (`isValidIsraeliId`, lines 175-186) — correct algorithm (digits × 1/2 alternating, sum-of-digits if >9, mod 10).
- **Control hash** (lines 307-318) — `Σ(bank + branch + account + aggurot) mod 10^16`, BigInt math. Matches Masav truncation-detection convention.
- **Return-file parser** (`parseReturnFile`, line 545) — bilingual rejection-code table (lines 619-631): codes 1=חשבון לא קיים, 2=סגור, 3=יתרה לא מספקת, 4=מוטב נפטר, 5=מס"ב מסרב, 6=הוראה בוטלה, 7=פרטים שגויים, 8=סניף סגור, 9=ת"ז שגויה, 10=שם לא תואם, 99=טכנית. Correct subset of real Masav reason codes.
- **Batch state machine:** draft → validated → exported → cancelled. Exported is **immutable** (line 384). `cancelBatch` never deletes (line 740).
- **PDF summary writer** (`buildSummary`, line 643) — builds a minimal PDF 1.4 (Courier 10pt, single page) without a PDF library.

**Gaps:**
- **No bank-supplied seed file for routing of branch numbers** — the validator only checks that branch is 1-3 digits (`/^[0-9]{1,3}$/`, line 446). Real Masav requires the branch to belong to the named bank's branch list.
- **Header/Detail/Trailer field positions** in this implementation deviate slightly from BoI spec — pos 5-12 of Header is documented as 8-char composite, but the code assembles 3+5=8 chars (`branch` 3 + `account` 5). For a 13-char account holder, the trailing digits would be lost. Real Masav uses pos 5-7 (branch 3) + pos 8-20 (account 13) on the **detail** line and a different layout on header. Recommend cross-referencing מס"ב הוראות תפעוליות 2024 before going live.
- **`encoding === 'cp862'`** path is not exercised by tests in `onyx-procurement/test/bank-routes.test.js`.

---

## 3. Check deposit & check register

`onyx-procurement/src/finance/check-register.js` (1,397 lines) — comprehensive.

- Outgoing + incoming check tracking with sequential numbering per account.
- **Endorsement chain** per סעיף 13 פקודת השטרות.
- **Bounced-check law** (חוק שיקים ללא כיסוי התשמ"א-1981) thresholds: 10/12mo → לקוח מוגבל (1y), 15/12mo → לקוח מוגבל חמור (2y) (lines 50-56).
- **Dual-signature void** (ביטול דו-חתימתי).
- **Postdated checks** (צ'קים דחויים) tracked.
- Lifecycle: posted → pending → cleared | bounced | returned.

**Missing — deposit slip generation:**
- No "שובר הפקדה" / batch deposit slip builder. Each deposit is recorded against a check, but there is no PDF/printable slip that aggregates N checks per (drawer-bank, drawer-branch) for physical bank counter deposit.
- No `bank_deposits` (or `check_deposits`) table — deposits are flat fields on each check row.
- Restricted-customer (לקוח מוגבל) lookup is a **stub** — no real BoI registry integration. Comment on line 16 admits this.

---

## 4. Balance reconciliation

`onyx-procurement/src/bank/reconciliation.js` (1,043 lines) — multi-pass ladder:

| Pass | Rule | Confidence |
|------|------|------------|
| 1 | EXACT (amount + date + reference) | 1.00 |
| 2 | DATE±1 (amount + date ±1d) | 0.95 |
| 3 | DESC±3 (amount + date ±3d + desc sim) | 0.85 |
| 4 | ROUNDING (amount ±0.01 + date) | 0.90 |
| 5 | GROUP (sum of GL[k..k+n] ≈ bank line) | 0.80 |
| 6 | SPLIT (one bank line → many GL) | 0.80 |
| 7 | FUZZY DESC (Levenshtein < 5) | 0.60 |
| 8 | UNMATCHED (propose adjusting JE) | — |

State machine: draft → in_progress → completed(locked). `undoMatch` moves to `unmatched` history; **never deletes** (matches the project doctrine).

The pair scorer (`onyx-procurement/src/bank/matcher.js:12-79`) is correctly biased on amount (0.6 weight), with date/name/reference/direction modifiers. Direction sanity check (lines 65-73) — customer payments must be credits (positive), supplier payments must be debits (negative).

**Multi-format parser** (`onyx-procurement/src/bank/multi-format-parser.js`, 1,090 lines) — supports CSV (Hebrew column hints in `parsers.js:20-29`), MT940 (SWIFT), CAMT.053 (XML, fixture at `onyx-procurement/src/bank/fixtures/fixture-camt053.xml`), Excel (deferred). The CSV column hints correctly cover Hebrew bank-export headers (תאריך / סכום / חובה / זכות / יתרה / אסמכתא / שם המעביר).

**API surface** (`onyx-procurement/src/bank/bank-routes.js`):
- `GET /api/bank/accounts`, `POST /api/bank/accounts`, `PATCH /api/bank/accounts/:id`
- `POST /api/bank/accounts/:id/import` — uploads a statement, validates account exists (BUG-13 fix line 44), auto-parses, creates `bank_statements` header + N `bank_transactions`, updates account balance.
- `POST /api/bank/accounts/:id/auto-reconcile` — pulls unreconciled tx + open invoices + sent POs, calls `autoReconcileBatch`, returns suggestions with `autoApproveThreshold: 0.95`.
- `POST /api/bank/matches`, `POST /api/bank/matches/:matchId/(approve|reject)` — manual + workflow.
- `GET /api/bank/summary` — reads `v_unreconciled_summary` view (defined in migration 006:144-155).

All routes audit-log via the injected `audit()` callback in Hebrew (line 24, 36, 100, 156, 190).

---

## 5. Cross-cutting risks

- **RLS:** AGENT-09-db-integrity.md flags all `public.bank*` and `treasury.*` tables as `USING (true)` permissive. Bank tables are books-of-record and must be tenant-isolated before production. **CRITICAL.**
- **No FK between `bank_transactions.matched_to_id` and any target table** — `matched_to_id` is `TEXT` (migration 006:83). Reconciliation can be left dangling if a target invoice is rolled back.
- **Reconciliation in-memory store** — `reconciliation.js` keeps state in module-local Maps (per file header line 17). Not persisted; restart loses in-progress sessions. The `reconciliation_matches` and `reconciliation_discrepancies` SQL tables exist for the persistent layer, but the engine doesn't appear to write to them in real-time during a session.
- **Masav batch store also in-memory** — `_store` Map in `masav-exporter.js:102`. Exported batches are not persisted past process lifetime; the SHA-256 + control hash should be written to a `masav_batches` table (does not exist).

---

## 6. Required additions (in priority order)

| # | Item | Where |
|---|------|-------|
| 1 | Create `bank_cards` table (id, bank_account_id FK, masked_number, brand VISA/MASTERCARD/ISRACARD, holder_name, expiry_month/year, status, credit_limit) | new migration |
| 2 | Create `bank_loans` table (id, bank_account_id FK, principal, interest_rate, start_date, term_months, schedule JSONB, balloon, payoff_date, current_balance, status) | new migration |
| 3 | Consolidate `bank_accounts_master` ↔ `bank_accounts` into single source of truth | migration + oracle-financial-core fix |
| 4 | Persist Masav batches to `masav_batches` + `masav_batch_lines` | new migration + masav-exporter store adapter |
| 5 | Persist reconciliation sessions to DB instead of in-memory Map | reconciliation.js refactor |
| 6 | Add `bank_deposits` (check deposit slip) table + slip-PDF generator | new module + UI |
| 7 | Tighten RLS policies on bank.* tables (per AGENT-09) | migration 0007x |
| 8 | Cross-reference Masav header field offsets vs official BoI 2024 spec before production | manual |

---

## 7. Files reviewed (absolute paths)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\supabase\migrations\006-bank-reconciliation.sql`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank\bank-routes.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank\matcher.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank\reconciliation.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank\parsers.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank\multi-format-parser.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank-files\masav-exporter.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\finance\check-register.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\bank-routes.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\oracle-financial-core.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\bank-accounts.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\masav-management.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports-25\AGENT-09-db-integrity.md`
