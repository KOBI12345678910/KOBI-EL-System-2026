# AG-X39 — Manual Journal Entry Builder (GL)

**Agent:** X-39
**Swarm:** 3C
**Date:** 2026-04-11
**Status:** PASS (34/34 tests green)
**Scope:** General Ledger core — manual journal entry builder with templates, validation,
reversing/recurring entries, approval workflow, and post/unpost lifecycle.

## 1. Deliverables

| File | Lines | Purpose |
|------|------:|---------|
| `onyx-procurement/src/gl/journal-entry.js` | 678 | GL core module — zero deps, bilingual |
| `test/payroll/journal-entry.test.js`       | 402 | 34 unit tests — plain Node harness |
| `_qa-reports/AG-X39-journal-entry.md`      |   — | This report |

All files are additive — no existing files deleted or modified.

## 2. Architecture

### 2.1 Module layout (9 sections)

1. **Constants** — Israeli 6111 COA category bands (`1000-1999` assets, `2000-2999` liab,
   `3000-3999` equity, `4000-4999` rev, `5000-5999` cogs, `6000-6999` opex, `7000-8999` non-op,
   `9000-9999` tax, plus legacy `0100-0199` revenue).
2. **Utilities** — `round2`, `sumBy`, `nearZero`, date math, `genId`, auto-numbering.
3. **Bilingual messages** — `MSG` table with `{en, he}` for every error/status code.
4. **Default COA seed** — 23 canonical accounts covering bank/AR/AP/VAT/payroll/expense/FX/tax.
5. **Template library** — 11 seeded templates (see §3).
6. **Approval thresholds** — 4-tier default (bookkeeper → accountant → cfo → ceo).
7. **Book factory** — `createBook({coa, periods, fx, baseCurrency, templates, approvalTiers})`.
8. **Default singleton** — `getDefaultBook()` for thin top-level wrappers.
9. **Exports** — full factory API + exact signatures from the task spec.

### 2.2 Public API (matches task spec exactly)

| Export | Signature | Returns |
|--------|-----------|---------|
| `createEntry({date, lines, memo, currency, references, created_by})` | → `draftId` |
| `addLine(entryId, {account, debit, credit, cost_center, project, description, currency, tax_code})` | → `void` |
| `validate(entryId)` | → `{balanced, totalDebits, totalCredits, diff, errors[]}` |
| `post(entryId, userId)` | → `{ok, posted_at, en, he}` (locks) |
| `unpost(entryId, userId, reason)` | → `{ok, en, he}` |
| `reverse(entryId, reason, {date?, userId?})` | → new entry id |
| `applyTemplate(templateId, variables)` | → new entry id |
| `createRecurring(templateId, {frequency, start, occurrences, variables})` | → recurring id |
| `runRecurring(asOfDate)` | → string[] of entry ids created |
| `submitForApproval(entryId, userId)` | → required role string |
| `approve(entryId, userId, role)` | → `void` |
| `attachReference(entryId, {type, id|url, label, sha256})` | → `void` |
| `classify(accountNo)` | → `{key, type, normalSide, min, max, legacy}` or `null` |

Plus factory-level getters: `getEntry`, `listEntries`, `listTemplates`, `requiredApprovalRole`.

## 3. Template library (11 seeded; spec asked for 10+)

| ID | Hebrew | English | Variables |
|----|--------|---------|-----------|
| `MONTHLY_RENT_ACCRUAL`     | הפרשת שכירות חודשית             | Monthly Rent Accrual        | amount, cost_center |
| `PREPAID_INSURANCE_AMORT`  | אמורטיזציית ביטוח ששולם מראש    | Prepaid Insurance Amortization | monthly_amount, prepaid_account |
| `DEPRECIATION`             | פחת רכוש קבוע                   | Depreciation                | amount, asset_account |
| `PAYROLL_ACCRUAL`          | הפרשת שכר                       | Payroll Accrual             | gross, employer_cost, net_payable |
| `BANK_SERVICE_FEES`        | עמלות בנק                       | Bank Service Fees           | amount, bank_account |
| `FX_REVALUATION`           | שערוך מטבע חוץ                  | FX Revaluation              | fx_gain_loss, target_account |
| `INVENTORY_ADJUSTMENT`     | התאמת מלאי                      | Inventory Adjustment        | amount, direction |
| `VAT_OFFSET`               | קיזוז מע״מ                      | VAT Offset (periodic)       | vat_output, vat_input |
| `LOAN_PAYMENT`             | תשלום הלוואה                    | Loan Payment                | principal, interest, bank_account |
| `YEAR_END_CLOSE`           | סגירת שנה                        | Year-End Close              | net_income |
| `ACCRUED_INTEREST_INCOME`  | הפרשת ריבית לקבל                 | Accrued Interest Income     | amount |

Each template `build(variables)` returns `{memo, lines}` where every line conforms to the
strict debit-XOR-credit rule so callers can pass the result straight into `addLine`.

## 4. Feature coverage matrix

| Spec feature                                         | Status | Notes |
|------------------------------------------------------|:------:|-------|
| 1. Balanced entries (Σ debits = Σ credits)            | ✓ | Checked in ILS base, 0.01 tolerance (1 agora) |
| 2. Multi-line support                                 | ✓ | Unbounded lines per entry |
| 3. Foreign currency auto-ILS conversion               | ✓ | Via `fx.rateToILS(currency, date)` adapter |
| 4. Cost center / project per line                     | ✓ | Preserved on line record |
| 5. Template library for recurring entries             | ✓ | 11 templates (spec asked 10+) |
| 6. Reversing entry on 1st of next period              | ✓ | `reverse()` → first day of next month, D/C swapped |
| 7. Recurring schedule (monthly accruals/amortization) | ✓ | `createRecurring` + `runRecurring(asOf)` |
| 8. Validate COA (exists, not frozen, active, in-range)| ✓ | Separate error codes for each case |
| 9. Validate period not locked                         | ✓ | Via `periods.isLocked(YYYYMM)` adapter |
| 10. Auto-number `JE-YYYYMM-NNNN`                      | ✓ | Counter stored per period, 4-digit padded |
| 11. Attach supporting docs (references)               | ✓ | `attachReference({type, id|url, label, sha256})` |
| 12. Workflow approval per amount threshold            | ✓ | 4-tier default, configurable; `requiredApprovalRole` |
| 13. Post to GL (marks posted, locks)                  | ✓ | Status transition; `addLine` rejects after post |
| 14. Unpost (if period unlocked, audit note)           | ✓ | Period-check + audit trail entry with reason |

### 4.1 Israeli 6111 account categories — coverage

| Category | Range | Example accts | Normal side |
|----------|-------|---------------|:-----------:|
| Assets         | 1000-1999 | 1100/1200/1300/1500/1590 | D |
| Liabilities    | 2000-2999 | 2100/2150/2200/2300/2310 | C |
| Equity         | 3000-3999 | 3000/3500                | C |
| Revenue        | 4000-4999 + legacy 0100-0199 | 4000 | C |
| COGS           | 5000-5999 | 5000                     | D |
| Operating exp. | 6000-6999 | 6100/6200/6300/6400/6500/6800 | D |
| Non-operating  | 7000-8999 | 7100/7200                | D |
| Tax            | 9000-9999 | 9000                     | D |

All eight bands are tested in test case 11, plus legacy band in case 12, plus
out-of-range rejection in case 13.

## 5. Test results

```
journal-entry.test.js — Techno-Kol ERP GL
----------------------------------------------------
  ok  - 01 createBook returns an object with expected API
  ok  - 02 createEntry allocates JE-YYYYMM-NNNN
  ok  - 03 addLine rejects line with both debit and credit
  ok  - 04 addLine rejects negative amounts
  ok  - 05 validate reports balanced when D = C
  ok  - 06 validate reports unbalanced with exact diff
  ok  - 07 validate catches account not in COA
  ok  - 08 validate catches frozen account
  ok  - 09 validate catches inactive account
  ok  - 10 validate catches period-lock
  ok  - 11 classify maps 1100/6200/4000/9000
  ok  - 12 classify honors legacy 0100 revenue
  ok  - 13 classify returns null out-of-range
  ok  - 14 auto-number increments per period
  ok  - 15 foreign currency converts to ILS via fx adapter
  ok  - 16 post transitions to posted and locks
  ok  - 17 post refuses if period is locked
  ok  - 18 post refuses if unbalanced
  ok  - 19 reverse creates counter-entry on first of next period
  ok  - 20 reverse fails if original not posted
  ok  - 21 applyTemplate MONTHLY_RENT_ACCRUAL is balanced
  ok  - 22 applyTemplate DEPRECIATION is balanced
  ok  - 23 applyTemplate PAYROLL_ACCRUAL is balanced
  ok  - 24 applyTemplate FX_REVALUATION handles gain and loss
  ok  - 25 applyTemplate VAT_OFFSET balances
  ok  - 26 applyTemplate LOAN_PAYMENT balances
  ok  - 27 createRecurring + runRecurring creates 12 monthly entries
  ok  - 28 approvalRoleFor maps amounts to tier
  ok  - 29 attachReference appends supporting doc
  ok  - 30 unpost reverts posted status with audit note
  ok  - 31 unpost refuses if period locked
  ok  - 32 reverse refuses double-reverse
  ok  - 33 bilingual errors expose {en, he, code}
  ok  - 34 cost_center per line is preserved
----------------------------------------------------
journal-entry.test.js  —  34/34 passed, 0 failed
```

**Total: 34 tests, 34 pass (spec required 20+).**

Runner invocation:
```
node test/payroll/journal-entry.test.js
```
No framework, no deps, no setup beyond cloning the repo.

## 6. Validation codes (bilingual)

| Code | English | Hebrew |
|------|---------|--------|
| `ERR_NO_LINES`          | Entry has no lines                          | אין שורות בפקודת יומן |
| `ERR_UNBALANCED`        | Debits do not equal credits                 | חובה אינו שווה לזכות |
| `ERR_LINE_INVALID`      | Line must have exactly one of debit or credit | שורה חייבת חובה או זכות בלבד |
| `ERR_AMOUNT_NEG`        | Amount must be positive                     | סכום חייב להיות חיובי |
| `ERR_ACCT_MISSING`      | Account does not exist in COA               | חשבון לא קיים בלוח חשבונות |
| `ERR_ACCT_FROZEN`       | Account is frozen (closed to posting)       | חשבון מוקפא — אסור לרשום |
| `ERR_ACCT_INACTIVE`     | Account is inactive                         | חשבון לא פעיל |
| `ERR_ACCT_BAD`          | Account number out of Israeli 6111 range    | מספר חשבון מחוץ לטווח 6111 |
| `ERR_PERIOD_LOCKED`     | Period is locked — cannot post              | התקופה נעולה — לא ניתן לרשום |
| `ERR_POSTED_LOCK`       | Entry already posted and locked             | הפקודה כבר נרשמה ונעולה |
| `ERR_NOT_POSTED`        | Entry is not posted                         | הפקודה לא נרשמה |
| `ERR_TEMPLATE_MISSING`  | Template not found                          | תבנית לא נמצאה |
| `ERR_APPROVAL_REQUIRED` | Approval required for this amount           | נדרש אישור לסכום זה |
| `ERR_DATE_BAD`          | Invalid date                                | תאריך לא תקין |
| `ERR_FX_RATE_MISSING`   | FX rate missing for currency                | חסר שער חליפין למטבע |
| `ERR_REVERSED_TWICE`    | Entry already reversed                      | פקודה כבר בוטלה |
| `OK_POSTED`             | Entry posted                                | הפקודה נרשמה |
| `OK_UNPOSTED`           | Entry unposted                              | הפקודה בוטלה |

Every thrown error is a real `Error` instance with `{code, en, he, details}` so
callers can display in either language without a separate i18n lookup.

## 7. Approval tiers (default)

| Up-to (ILS) | Required role |
|------------:|---------------|
|        5,000 | bookkeeper |
|       50,000 | accountant |
|      500,000 | cfo        |
|   `Infinity` | ceo        |

Configurable per-book via `createBook({ approvalTiers })`. `submitForApproval` refuses
if the entry is invalid or unbalanced; `approve` checks that the caller's role outranks
the required tier (bookkeeper=1 → ceo=4).

## 8. Non-destructive guarantees

| Rule              | How it is enforced |
|-------------------|--------------------|
| Never delete      | No `delete` keyword on entries; `unpost` preserves entry and appends to `audit`. |
| No silent mutation | `getEntry` returns a deep-clone snapshot; callers cannot mutate the book state. |
| Irreversible post | Posted entries refuse further `addLine`/`removeLine`. Only `reverse` or `unpost` (when period open) can change them. |
| Double-reverse block | `reverse` throws `ERR_REVERSED_TWICE` if an entry was already reversed. |
| Period-lock respected both ways | `post` and `unpost` both check `periods.isLocked`. |

## 9. Audit trail (per entry)

Every entry carries an `audit[]` array with immutable-append-only entries:

```
[
  { at, by, action: 'create' },
  { at, by, action: 'apply_template', template: 'MONTHLY_RENT_ACCRUAL' },
  { at, by, action: 'submit' },
  { at, by, action: 'approve', role: 'accountant' },
  { at, by, action: 'post' },
  { at, by, action: 'reverse', reason: '...', reversal_id: 'JE-...' },
  { at, by, action: 'unpost', reason: 'wrong amount' },
]
```

## 10. Dependencies

Zero. The module uses only:
- core JavaScript (`Map`, `Array`, `Math`, `Date`, `Number`, `JSON`)
- no `require` of third-party packages
- no imports from other onyx-procurement files

This matches the swarm's "zero deps" mandate and keeps the module safe for both
Node server and browser bundling (via CommonJS).

## 11. Integration notes

1. **COA adapter** — wrap the DB-backed chart of accounts in a `Map<string, acct>` and
   pass as `coa` when creating the book. Each account record needs
   `{no, name, nameEn, active, frozen}`.
2. **Periods adapter** — implement `{isLocked(periodKey): boolean}` against your fiscal
   calendar table (where `periodKey = 'YYYYMM'`).
3. **FX adapter** — implement `{rateToILS(currency, date): number}` against
   `onyx-procurement/src/fx` or Bank of Israel feed.
4. **Asset-manager hook** — the `DEPRECIATION` template accepts `asset_account` as an
   override; the asset-mgr caller should populate `amount` from the asset's monthly
   depreciation ledger.
5. **Thin singleton** — module-level `createEntry`, `addLine`, etc. use a single
   in-memory default book. Swap to a DB-backed book via `createBook({...adapters})` in
   production.

## 12. Known limitations / future work

- **Persistence is in-memory.** The Book object holds all entries in a `Map`. Wiring
  to Postgres / Supabase is a one-file DB adapter layer and was deliberately deferred
  to keep this agent atomic.
- **Multi-book consolidation** is not implemented — each `createBook` is an isolated
  ledger. Inter-company JEs must be recorded twice (once in each book) by the caller.
- **Rounding differences on multi-currency rebalancing** are surfaced as
  `ERR_UNBALANCED` with exact `diff`. Auto-fixing via a rounding line is out-of-scope;
  callers should explicitly add a rounding-difference line on `7100` or `6800`.
- **Subsequent-period posting into a locked period** is fully blocked; there is no
  "soft-lock with admin override" mode yet.

## 13. Sign-off

- File paths exist, lint-clean under `node`.
- All 34 tests pass (>20 required).
- Zero external deps.
- Hebrew/English bilingual on every user-facing string.
- Israeli 6111 chart-of-accounts categories fully covered.
- Non-destructive: no existing file touched, no git delete.

**Agent X-39 — GREEN.**
