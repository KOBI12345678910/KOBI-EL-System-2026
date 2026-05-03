# AGENT-327 — Accounting (הנהלת חשבונות) Deep Audit

**Date:** 2026-04-29  **Scope:** Chart of Accounts, Journal, GL, Subledgers (AR/AP/Inventory), Trial Balance, Period Close, Year-End, Audit Trail  **Standard:** Israeli accounting law (פקודת מס הכנסה, חוק מע"מ, הוראות ניהול ספרים תשל"ג, IFRS as adopted by IL).  **Cross-ref:** AGENT-32 (orchestrator/GL postings).

## Verdict
**RED — Not production-grade for IL statutory accounting.** Module has SAP-flavored aspirations (Oracle-style multi-dimensional GL, balance enforcement, period mechanism) but suffers from **table triplication, schema/route drift, SQL-injection-prone string interpolation in financial paths, and missing IL statutory primitives (Year-End, סטורנו audit, ספר ראשי immutability, אישורי ניכוי integration to GL).** Cannot pass תיק רואה חשבון inspection or pre-audit (סקירה).

---

## 1. Chart of Accounts (חשבונות) — YELLOW

**Files:**
- `api-server/src/routes/chart-of-accounts.ts` (canonical CRUD on `chart_of_accounts`)
- `api-server/src/routes/oracle-financial-core.ts:80` — defines `gl_accounts_master`
- `api-server/src/routes/finance-enterprise.ts:737` — reads `financial_accounts`
- `erp-app/src/pages/finance/chart-of-accounts.tsx` (UI)

**Strengths:**
- Hierarchy (`parent_account_id`, `hierarchy_path`, `hierarchy_level`), normal-balance auto-derivation, FK soft-delete (closes account, blocks delete on parents with children), 9 valid account types incl. contra-accounts, Hebrew RTL labels.

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 1.1 | **CRITICAL** | **Three competing CoA tables exist concurrently:** `chart_of_accounts` (route), `gl_accounts_master` (oracle-financial-core), `financial_accounts` (finance-enterprise). No single source of truth — trial balance reads `financial_accounts`, journal-entries reads `journal_entry_lines.gl_account_no`, period-close reads `gl_journal_entries`. Postings go to one table, reports read another. |
| 1.2 | HIGH | No IL standard CoA template seeded (חמשת הספרות per דוח 856 / מבנה חשבונות לעוסק מורשה). User must manually create חשבונות אסטרטגיים (1000 לקוחות, 2000 ספקים, 4000 הכנסות, etc.). |
| 1.3 | HIGH | `tax_category` and `tax_rate` columns exist but no enforcement of VAT mapping (חשבון תוצאתי חייב מע"מ vs פטור vs אפס). |
| 1.4 | MED | `current_balance` stored on row — denormalized counter that drifts out of sync with `gl_journal_lines` aggregates. No reconciliation job. |
| 1.5 | MED | DELETE route calls `UPDATE … status='closed'` but does not check if account has historical postings — closing an account with ledger activity should be blocked, not just children. |

---

## 2. Journal Entries (יומן) — RED

**Files:**
- `api-server/src/routes/finance/journal-entries.ts` (route, refers `postingDate`)
- `AI-Task-Manager/lib/db/src/schema/journal-entries.ts` (schema, **has `entryDate`, NOT `postingDate`**)
- `api-server/src/routes/oracle-financial-core.ts:103` (parallel `gl_journal_entries` + `gl_journal_lines`)

**Strengths:**
- Header+lines model. Balance enforcement (Math.abs(D-C) >= 0.01 rejects). DRAFT→POSTED state machine. Posted-immutable rule. Reversal creates mirror entry (סטורנו) with `-REV` suffix and original marked REVERSED.

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 2.1 | **BLOCKER** | **Schema/route field-name drift:** route filters on `journalEntriesTable.postingDate` (line 32, 352) but the Drizzle schema declares `entryDate` (no `postingDate` column). All filter-by-date queries either silently no-op or 500. List API + trial-balance summary effectively broken. |
| 2.2 | **BLOCKER** | **Two parallel journal stacks:** `journal_entries` (Drizzle/route) vs `gl_journal_entries` (oracle-financial-core, defined inline via `sql.raw`). Bookings from procurement/AP/AR may land in either depending on which engine fired. No unified posting service. |
| 2.3 | **CRITICAL** | **SQL-injection vector in oracle-financial-core posting path** — uses `sql.raw(...)` with user-controlled values via `esc()` (manual single-quote doubling) for description, project, cost_center, account_code. 17 occurrences. Acceptable for read but unsafe for write paths handling currency. |
| 2.4 | **CRITICAL** | **Period-locking gap:** journal-entries.ts POST does NOT check if posting_date falls into a closed period. oracle-financial-core does check (line 616) but auto-creates period if missing — bypasses control. A user can post into prior closed Q1 once status='closed' if route uses Drizzle stack. |
| 2.5 | HIGH | No sequential journal numbering enforcement (פנקס יומן לפי סדר כרונולוגי per תקנות ניהול ספרים §22). `JE-${Date.now()}` is timestamp-based, not gap-free incremental. Missing gap-detection report. |
| 2.6 | HIGH | Reversal does not block reversing-the-reversal (no check on `sourceType='REVERSAL'`). Could create infinite reversal chain. |
| 2.7 | HIGH | Posted entries not cryptographically sealed (no hash/checksum). Posted-immutable enforced only by `status` check — direct DB UPDATE bypasses it. |
| 2.8 | MED | Multi-currency: `exchange_rate` stored but no FX-revaluation routine for open AR/AP at period-end (תקן 13 — מטבע פעילות). |
| 2.9 | MED | No approval workflow before POST — single-user can draft and post (lack of segregation of duties for entries above materiality threshold). |

---

## 3. General Ledger (ספר ראשי / כללי) — RED

**Files:**
- `AI-Task-Manager/lib/db/src/schema/general-ledger.ts` (standalone `general_ledger` table — NOT linked to `journal_entry_lines`)
- `erp-app/src/pages/finance/general-ledger.tsx`

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 3.1 | **BLOCKER** | **`general_ledger` table is a denormalized parallel ledger:** schema has `entry_number, account_number, debit_amount, credit_amount, running_balance, journal_entry_id`. Nothing populates it from `journal_entries` posting. UI page reads it but it is empty unless legacy ETL ran. |
| 3.2 | HIGH | No GL = ∑ subledger reconciliation report (control-account proof). AR control account vs ar_invoices.balance_due not enforced. |
| 3.3 | HIGH | `running_balance` per row would require ordered window-function recompute on every insert — no trigger does this. |
| 3.4 | MED | Hierarchy roll-up (parent account balances) only reads `current_balance` on chart_of_accounts (1.4 above). |

---

## 4. Subledgers (AR / AP / Inventory) — YELLOW

**Files:**
- `api-server/src/routes/ap-ar-control.ts` — AR/AP aging snapshots
- `api-server/src/routes/oracle-financial-core.ts:174-310` — `ap_invoices`, `ap_payments`, `ar_invoices`, `ar_receipts`, `ar_aging_snapshot`
- `api-server/src/routes/ap-enterprise.ts`

**Strengths:**
- AR & AP aging buckets (current/30/60/90/120+), risk classification, payment promises, collection tasks. Three-way match flag on AP. Withholding tax field on AP.

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 4.1 | HIGH | **Aging snapshot is INSERT-only via API body (`/ap-ar/snapshot-ar`).** Caller posts pre-computed buckets — does NOT re-aggregate from `ar_invoices` ledger. Snapshot integrity = client-trusted. |
| 4.2 | HIGH | AP/AR invoice tables don't reference `journal_entry_id` consistently with the booked GL row — `gl_posted` flag set but reverse traversal from GL to source-doc is fragile. |
| 4.3 | HIGH | Inventory subledger has no GL integration trigger here. Goods-receipt and Cost-of-Goods-Sold postings (account 5000) not auto-generated. AGENT-32 GL audit notes this gap. |
| 4.4 | MED | `withholding_tax` on AP-payment but no link to `tax_records` (form 856) — manual reconciliation needed for אישורי ניכוי שנתי. |
| 4.5 | MED | No customer/supplier statement generator wired (יתרת חשבון לקוח/ספק לתאריך X). |

---

## 5. Trial Balance (מאזן בוחן) — RED

**Files:**
- `api-server/src/routes/oracle-financial-core.ts:698` — aggregates from `gl_journal_lines`
- `api-server/src/routes/finance-enterprise.ts:737` — reads denormalized `financial_accounts.balance`
- `api-server/src/routes/finance/journal-entries.ts:339` — aggregates from `journal_entry_lines`
- `api-server/src/routes/finance-enterprise4.ts:382`

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 5.1 | **BLOCKER** | **Four (4) different trial-balance endpoints, three different source-of-truth tables.** No agreement on which to render. UI calls `/api/trial-balance?period=X` (`erp-app/src/pages/finance/trial-balance.tsx:70`) — no such canonical route registered; will hit one of the four randomly via mounted prefixes. |
| 5.2 | HIGH | No opening-balance vs period-movement vs closing-balance columns delivered by API even though UI declares `opening_debit/credit, period_debit/credit, closing_debit/credit` (lines 25-30 of UI). All endpoints return only period totals. |
| 5.3 | HIGH | No drill-down from TB row → journal entries (one of the 9 Master 360 contracts: "What can I do? Related records?"). |
| 5.4 | MED | No comparative period (חודש מקביל אשתקד / שנה מול שנה). |

---

## 6. Period Close (סגירת תקופה) — YELLOW

**Files:**
- `api-server/src/routes/oracle-financial-core.ts:1116` — `/period-close/:period`
- `api-server/src/routes/financial-statements.ts:82` — alternate `/api/financial-statements/close-period/:periodId`

**Strengths:**
- Blocks close if unposted drafts exist. Audit columns `closed_by, closed_at`. Aging snapshot on close. Period statuses open/closing/closed.

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 6.1 | HIGH | **Two parallel period systems** (`gl_periods` + `financial_periods`). Closing one does not lock the other. |
| 6.2 | HIGH | No reversal-of-close (re-open) workflow with required justification + audit. |
| 6.3 | HIGH | No accruals/prepayments automatic reversal at start of next period (תקן חשבונאות 25). |
| 6.4 | MED | No FX revaluation, depreciation auto-post, or bank reconciliation prerequisite gates before close. |
| 6.5 | MED | No "soft close" (preliminary) vs "hard close" (final) distinction. |

---

## 7. Year-End Close (סגירת שנת מס) — RED

**Files:** None found. Glob `**/*year-end*` returned 0 results.

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 7.1 | **BLOCKER** | **No year-end closing entries engine.** Required: zero out revenue/expense accounts to retained-earnings (יתרת רווחים), open new fiscal year, copy opening balances. Not implemented. |
| 7.2 | **BLOCKER** | No דוח התאמה למס (tax-to-book reconciliation), no schedule of התאמות מס (timing differences). |
| 7.3 | HIGH | No PCN874 (תיק ניידות מס) snapshot lock at year-end (per AGENT-132 referenced). |
| 7.4 | HIGH | No retained-earnings account flow visualization or rollforward report. |

---

## 8. Audit Trail (יומן ביקורת) — YELLOW

**Files:**
- `api-server/src/routes/audit-log.ts`
- `api-server/src/lib/audit-logger.ts`

**Strengths:**
- Central `audit_log` table with action/table_name/record_id/user/before/after/created_at. Stats by action and table. Full-text search.

**Findings:**
| # | Severity | Issue |
|---|---|---|
| 8.1 | **CRITICAL** | **SQL-injection in audit-log filter** (lines 18-29) — string concatenation of `table_name`, `action`, `module`, `from_date`, `to_date`, `user_name` with only `replace(/'/g,"''")` (does not handle backslash escape, ILIKE wildcards, comments). Audit endpoint must NOT be exploitable. |
| 8.2 | HIGH | `chart-of-accounts.ts`, `journal-entries.ts`, `oracle-financial-core.ts` do NOT call audit-logger on CREATE/UPDATE/DELETE — accounting CRUD is silent. Grep returned 0 calls to `audit_log` from those routes. |
| 8.3 | HIGH | Posted journal modifications (even on DRAFT) not audit-logged with before/after diff. |
| 8.4 | MED | No tamper-evidence (hash chain across audit_log rows) — admin with DB access can rewrite history. |
| 8.5 | MED | No retention policy (IL law: 7 years for accounting records — סעיף 25 לחוק מע"מ). |

---

## Israeli Accounting Law Compliance Matrix

| Requirement | Source | Status |
|---|---|---|
| Sequential gap-free journal (פנקס יומן) | תקנות ניהול ספרים תשל"ג §22 | FAIL (timestamp IDs) |
| 7-year retention | חוק מע"מ §25 | NOT IMPL |
| Hebrew & numeric account names | תקנות ניהול ספרים | OK |
| VAT 18% from 2026-01-01 | חוק מע"מ תיקון | OK (`VAT_EFFECTIVE_FROM`) |
| Withholding 856 integration | פקודת מס הכנסה §164 | PARTIAL |
| מאזן בוחן per period | תקנות ניהול ספרים | UI yes, API broken |
| סטורנו mirror, original preserved | חוזר מס הכנסה | OK |
| Posted-immutable | חוזר מס הכנסה | LOGIC ONLY (not DB-enforced) |
| Year-end closing | תקן 1 | NOT IMPL |
| Multi-currency revaluation | תקן 13 | NOT IMPL |
| Audit trail before/after | חוק חוקנות | PARTIAL |

---

## P0 Remediation Plan

1. **Pick one CoA table.** Drop two of {`chart_of_accounts`, `gl_accounts_master`, `financial_accounts`}. Migrate references. Deprecate `current_balance` denormalized column or back it with trigger.
2. **Pick one Journal stack.** Drop `gl_journal_entries` OR `journal_entries`. Standardize all postings (procurement, payroll, AR/AP, depreciation) on the survivor.
3. **Fix `postingDate` vs `entryDate` drift** (`api-server/src/routes/finance/journal-entries.ts:32,352`). Add Drizzle column or rename route.
4. **Replace all `sql.raw` + `esc()` write paths** in oracle-financial-core.ts with parameterized `sql\`...\`` template literals (Drizzle).
5. **Implement period-locking guard** as a middleware on every POST that books to GL: reject if `posting_date IN closed period`.
6. **Wire `audit-logger.ts`** into chart-of-accounts/journal-entries/period-close handlers (CREATE/UPDATE/DELETE/CLOSE/REOPEN).
7. **Build year-end engine**: revenue→retained earnings closing-entries generator, opening-balance roll, fiscal-year switch.
8. **Single canonical `/api/trial-balance`** with opening/period/closing columns and drill-down to JE.
9. **GL = subledger reconciliation report** (control accounts).
10. **Sequential journal numbering** with gap-detection report.
11. **Sanitize audit-log filters** — parameterize all of them.
12. **Seed Israeli CoA template** (1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx COGS, 6xxx-9xxx expenses) with VAT-category mapping.

## Cross-References
- AGENT-32 (orchestrator/GL postings) — confirms inventory/COGS/payroll postings not auto-generated.
- AGENT-132 (PCN874), AGENT-133 (form 856), AGENT-134 (form 102) — period-close should snapshot these.
- AGENT-309 (DB integrity deep) — likely flags the same triplication.
- AGENT-313 (security deep) — should escalate sql.raw findings here.

## Files of Interest (absolute paths)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\chart-of-accounts.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\oracle-financial-core.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\finance\journal-entries.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\financial-statements.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\ap-ar-control.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\israeli-accounting-engine.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\api-server\src\routes\audit-log.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\AI-Task-Manager\lib\db\src\schema\journal-entries.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\AI-Task-Manager\lib\db\src\schema\general-ledger.ts`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\trial-balance.tsx`

**Final verdict: RED. Module ships features but is not statutorily compliant nor architecturally sound. Cannot pass IL auditor (רואה חשבון מבקר) review without P0 items 1-6 done.**
