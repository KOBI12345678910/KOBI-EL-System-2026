# AGENT-184 — Bank Reconciliation Audit
**Agent:** 184 | **Date:** 2026-04-29 | **Worktree:** objective-merkle-40ff93
**Reference:** `_qa-reports/AG-X37-bank-reconciliation.md`
**Verdict:** PASS (engine + parsers); WARN (UI, DB schema)

---

## 1. Scope re-verified

X-37 claims a zero-dep, bilingual, never-delete reconciliation engine with
an 8-pass ladder, manual override, MT940/CSV parsing, 30/30 tests. I re-ran
the suite and audited every file named.

Files audited (all under repo root):
- `onyx-procurement/src/bank/reconciliation.js` (1043 lines)
- `onyx-procurement/src/bank/parsers.js` (258, CSV+MT940)
- `onyx-procurement/src/bank/multi-format-parser.js` (1090, OFX/QIF/CAMT.053/CSV-IL/PDF)
- `onyx-procurement/src/bank/matcher.js` (141, legacy scorer)
- `onyx-procurement/src/bank/bank-routes.js` (Express)
- `onyx-procurement/test/payroll/bank-reconciliation.test.js` (584, 30 tests)
- `payroll-autonomous/src/components/BankReconciliation.tsx` (305, UI)

---

## 2. Test re-run (2026-04-29)

```
node --test onyx-procurement/test/payroll/bank-reconciliation.test.js
ℹ tests 30 / pass 30 / fail 0 / duration_ms 4635.7
```

All 30 tests green. Coverage matches X-37's claim across lifecycle (4),
each pass (1-2 each), unmatched/manual/undo/adjustments/status/audit/internals.

---

## 3. Auto-match algorithm (engine)

Verified against source (`reconciliation.js:727-762`):

| # | Pass         | Rule                                                       | Confidence | Source line |
|--:|--------------|------------------------------------------------------------|:----------:|:-----------:|
| 1 | EXACT        | amount + same day + same reference                         |    1.00    | 538-557     |
| 2 | DATE_1       | amount + date ±1 day                                       |    0.95    | 559-577     |
| 3 | DESC_3       | amount + date ±3d + Jaccard ≥ 0.5                          |    0.85    | 579-598     |
| 4 | ROUNDING     | amount within ±0.01 + same date                            |    0.90    | 600-618     |
| 5 | GROUP        | 2..5 GL entries sum (±0.01) to one bank entry, ±3d window  |    0.80    | 627-647     |
| 6 | SPLIT        | 2..5 bank entries sum (±0.01) to one GL entry              |    0.80    | 655-674     |
| 7 | FUZZY_DESC   | Levenshtein < 5, same amount                               |    0.60    | 702-721     |
| 8 | UNMATCHED    | bilingual proposed adjustments (BANK_FEE/INTEREST/FX_DIFF) |     —      | 764-785     |
| — | MANUAL       | user-created via `manualMatch`                             |    1.00    | 791-810     |

`runAutoMatch` runs the passes sequentially and each pass consumes only
still-unmatched entries — confirmed by the `_matched` flag check at the top
of every `_pass*` loop. Order is deterministic.

Subset-sum (`_findSubsetSum`, line 681) uses backtracking DFS with three
prunes (descending sort, hard cap = 5, ±0.01 tolerance). NaN-safe via
`Number.isFinite` filter on amount. No `NaN` leak verified by test 29.

`SUSPICIOUS_BELOW = 0.75` flags FUZZY_DESC matches (0.60) automatically;
test 26 confirms.

---

## 4. Manual override

`manualMatch(reconId, glEntryId, bankEntryId)` (line 791):
- Validates both entries exist (throws bilingual error otherwise)
- Refuses to double-book — throws `one of the entries is already matched | אחת התנועות כבר תואמה`
- Creates a MANUAL match at confidence 1.00
- Appends bilingual audit entry

`undoMatch` (line 812) — never deletes. Sets `undone=true`,
`undone_at=<iso>`, releases the entries, and appends a new `undo_match`
audit entry while leaving the original `match_created` entry intact.
Verified by test 18.

`addAdjustment` (line 836) — accepts BANK_FEE / INTEREST / INTEREST_EXPENSE
/ FX_DIFF / ERROR / OTHER kinds, optionally consumes a bank entry, and
records bilingual audit. Rejects non-numeric amount.

After `complete(reconId, userId)`, every mutator (`importStatement`,
`loadGLEntries`, `manualMatch`, `undoMatch`, `addAdjustment`) throws
`reconciliation is locked | ההתאמה נעולה` via `_assertNotLocked` (line 362).
`complete` itself refuses unless `unmatched_count === 0` AND `is_balanced`
AND `userId` non-empty.

---

## 5. Statement parsing (MT940 / CSV)

### Legacy `parsers.js` (CSV + MT940)

CSV (line 73-148):
- `csv-parse/sync` dependency (only non-trivial dep in this file)
- Auto-detects header row in first 5 rows
- Hebrew-aware column hints: `תאריך/תיאור/חובה/זכות/יתרה/אסמכתא`
- Israeli DD/MM/YYYY date support (line 47-58)
- Handles ₪ symbol, thousands separators, negative-in-parens, Hebrew minus
- Computes `closingBalance = openingBalance + Σ amounts` if balance not given

MT940 (line 152-243):
- SWIFT tag-based parser (`:25:`, `:60F/M:`, `:61:`, `:86:`, `:62F/M:`)
- Parses YYMMDD opening/closing balance dates
- Multi-line `:86:` description continuation (line 231-234)
- Returns `{transactions, openingBalance, closingBalance, period, meta}`
- Throws `No transactions found in MT940 content` on empty parse

`autoParse` (line 247): sniffs `:20:` or `:25:` prefix to detect MT940,
otherwise falls through to CSV.

### Agent 69 `multi-format-parser.js` (additive)

Adds: OFX 2.x, QIF, CAMT.053 (ISO 20022), CSV-IL (per-bank profiles for
Leumi / Hapoalim / Mizrahi / Discount / Otsar HaHayal), PDF (soft-depends
on `pdf-parse`, gracefully degrades). Uses regex XML walker — no XML
library. Output is the normalized transaction shape consumed verbatim by
`reconciliation.importStatement` via the
`{transactions, opening_balance, closing_balance}` envelope.

---

## 6. Defensive behaviour spot-checks

Verified each item from X-37 §10:
- `startReconciliation('', …)` → throws `accountId is required | חשבון נדרש` (line 318)
- `period.from > period.to` → throws `period.from > period.to | תחילה אחרי סיום` (line 326)
- `manualMatch` rejects unknown ids and double-booking (797-800)
- `undoMatch` of unknown matchId throws (816)
- `addAdjustment` rejects non-finite amount (845-847)
- `complete` rejects without userId, with unmatched, with imbalance (937-948)
- `getReconciliation` returns deep clone via `_cloneDeep` (line 148, 970-972)

---

## 7. Findings — issues to flag

### WARN-1: Two parallel reconciliation stacks
`bank-routes.js` (REST) uses `matcher.js` + `parsers.js` and writes to
`reconciliation_matches` / `bank_transactions` tables. The new
`reconciliation.js` (X-37) is in-memory only and not wired to any HTTP
route or persisted to the DB. The two systems do not share state — a UI
auto-reconcile via `POST /api/bank/accounts/:id/auto-reconcile` does NOT
populate the X-37 session store, and `complete(reconId, userId)` does not
write any row. The X-37 engine is functionally orphaned at the HTTP layer.

### WARN-2: DB tables referenced by routes are missing from migrations
`bank-routes.js` writes to `bank_statements`, `bank_transactions`,
`reconciliation_matches`. Only `treasury.bank_accounts` exists in
`supabase/migrations/00027_enterprise_30_tables.sql:224`. The other three
tables are absent — the import endpoint will fail at runtime against a
fresh DB. Search confirms zero `CREATE TABLE` statements for them across
all migrations.

### WARN-3: UI is not wired to the engine
`payroll-autonomous/src/components/BankReconciliation.tsx` (305 lines) is
a 3-step wizard backed entirely by hard-coded `BANK_TXS` / `SYSTEM_TXS`
arrays. The "Auto-match" step does no real matching. On completion it
posts to `/api/finance/reconciliation/close` (best-effort with
`.catch(() => null)`) — that route is not in `bank-routes.js`. UI looks
finished but is decoupled from both reconciliation backends.

### INFO-1: `matcher.js` direction guard
`matcher.js:65-72` assumes credit-positive / debit-negative sign — same as
the X-37 engine and parsers, so consistent. Worth a unit-level assert.

---

## 8. Bilingual & never-delete compliance

- Every match object → `label_en` + `label_he` (PASS_LABELS line 108-117)
- Every adjustment kind → bilingual labels (ADJUSTMENT_KINDS line 119-126)
- Every audit entry → `label_en` + `label_he` (`_audit` line 368-377)
- Every thrown error → `EN | HE` (sampled lines 319, 325, 326, 358, 364,
  797, 816, 935, 938, 942, 946)
- `undoMatch` preserves the record (line 827-833) — verified test 18

PASS.

---

## 9. Sign-off

**Engine + parsers + tests:** APPROVE — matches X-37's claim, 30/30 green
on Node 18+, zero new deps, bilingual everywhere, defensive on every entry.

**Integration (HTTP + DB + UI):** WARN — three gaps block production:
1. Wire `runAutoMatch`/`manualMatch`/`complete` into Express routes
2. Add migration for the three missing tables
3. Replace hard-coded fixtures in `BankReconciliation.tsx` with real API calls

Recommend a follow-up agent to bridge engine ↔ HTTP ↔ DB ↔ UI.

**End of report — Agent 184**
