# AG-X37 — Automatic Bank Reconciliation Engine
**Agent:** X-37 | **Swarm:** 3C | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 30/30 tests green

---

## 1. Scope

A zero-dependency reconciliation engine that matches a parsed bank statement
against the general ledger using a multi-pass ladder of progressively looser
rules, then walks the session through a full lifecycle:

```
  startReconciliation → importStatement → loadGLEntries →
  runAutoMatch → manualMatch / undoMatch / addAdjustment →
  getStatus → complete (lock period)
```

Delivered files
- `onyx-procurement/src/bank/reconciliation.js` — the engine (≈920 lines)
- `onyx-procurement/test/payroll/bank-reconciliation.test.js` — 30 tests
- `_qa-reports/AG-X37-bank-reconciliation.md` — this report

Integrates with (but does not touch)
- `src/bank/matcher.js` — the pair scorer from Wave 1.5
- `src/bank/multi-format-parser.js` — Agent 69 multi-format bank parser
- `src/bank/parsers.js` — legacy CSV / MT940 parser

RULES respected
- **Never delete** — `undoMatch` moves matches to a permanent history slot
  (`undone=true`, `undone_at=<iso>`) instead of removing them from the array
- **Hebrew bilingual** — every match, signal, adjustment, audit line and
  thrown error carries `label_en`/`label_he` (or `EN | HE` for errors)
- **Zero deps** — only `node:crypto` for id generation; no lodash, no moment,
  no fuzzysort, no XML lib
- **Real code** — 30 tests exercise every pass and every mutation path

---

## 2. Public API

```js
const R = require('./src/bank/reconciliation.js');

// Core flow per the spec
R.startReconciliation(accountId, period) → reconId
R.importStatement(reconId, statementData) → importedCount
R.runAutoMatch(reconId) → { matched, unmatched, suspicious, by_pass, proposed_adjustments }
R.manualMatch(reconId, glEntryId, bankEntryId) → match
R.addAdjustment(reconId, entry) → adjustment
R.complete(reconId, userId) → { status: 'locked', ... }
R.getStatus(reconId) → { matched_count, unmatched_count, difference, ... }
R.undoMatch(reconId, matchId) → void

// Supporting ops
R.loadGLEntries(reconId, glEntries)
R.getReconciliation(reconId)    // read-only deep-clone
R.listReconciliations()
R.resetAll()                    // test helper
```

`statementData` accepts either an array of raw rows or the richer
`{opening_balance, closing_balance, transactions:[]}` envelope produced by
Agent 69's multi-format parser.

A `match` object carries:

```js
{
  id: 'match-<hex>',
  pass: 'exact' | 'date_pm1' | 'desc_pm3' | 'rounding'
      | 'group' | 'split' | 'fuzzy_desc' | 'manual',
  confidence: 0..1,
  label_en, label_he,
  bank_entry_ids: [...],
  gl_entry_ids:   [...],
  amount,
  created_at, created_by,
  criteria: { ...per-pass evidence },
  suspicious: boolean,          // confidence < 0.75
  undone?: true, undone_at?: iso
}
```

---

## 3. Multi-pass matching ladder

| Pass | Name        | Rule                                                             | Confidence |
|-----:|-------------|------------------------------------------------------------------|:----------:|
|   1  | `EXACT`     | amount + same day + same reference                              |  **1.00**  |
|   2  | `DATE_1`    | amount + date ±1 day                                             |  **0.95**  |
|   3  | `DESC_3`    | amount + date ±3d + similar description (Jaccard ≥ 0.5)          |  **0.85**  |
|   4  | `ROUNDING`  | amount within ±0.01 + same date                                  |  **0.90**  |
|   5  | `GROUP`     | 2..5 GL entries summing (±0.01) to one bank entry, same window   |  **0.80**  |
|   6  | `SPLIT`     | 2..5 bank entries summing (±0.01) to one GL entry, same window   |  **0.80**  |
|   7  | `FUZZY_DESC`| description-only (Levenshtein < 5), same amount                  |  **0.60**  |
|   8  | UNMATCHED   | proposes adjusting journal entry (fee/interest/fx/other)         |     —      |
|   —  | `MANUAL`    | user-created via `manualMatch`                                   |  **1.00**  |

Each pass consumes only still-unmatched entries, so an item reached by an
earlier pass is never re-considered. Deterministic and order-stable.

---

## 4. Subset-sum for GROUP / SPLIT

Backtracking DFS with the following pruning:

1. Skip any entry with absolute amount larger than remaining target
2. Descending-sort pool by amount so big chunks are tried first
3. Hard cap on size (`GROUP_MAX_MEMBERS = 5`) — avoids exponential blowup
4. Minimum size 2 — a single-entry "group" falls back to pass 1/2/3
5. Tolerance ±0.01 on the remainder

Exercised by two dedicated tests (10, 11) plus the internal helper test (29).

---

## 5. Levenshtein & Jaccard

Zero-dep edit distance with two-row DP — `O(min(|a|,|b|))` space,
`O(|a|·|b|)` time. Handles `null`/`undefined` (returns length of the other
side), empty strings, Hebrew, Latin, digits. Verified on the classic
`kitten → sitting = 3` case.

Jaccard over a token set (length ≥ 2 tokens, lowercased, Hebrew-aware
regex class `\u0590-\u05ff`). Used by pass 3 (`DESC_3`) to decide whether
descriptions "look the same".

---

## 6. Bank-fee / interest classification

Unmatched bank entries are classified heuristically for proposed adjustments:

| Keyword (regex)                      | Proposed kind       |
|--------------------------------------|---------------------|
| `/fee|עמל/i`                         | `BANK_FEE`          |
| `/interest|ריבית/i` & amount ≥ 0     | `INTEREST`          |
| `/interest|ריבית/i` & amount < 0     | `INTEREST_EXPENSE`  |
| `/fx|שער|exchange/i`                 | `FX_DIFF`           |
| none of the above                    | `OTHER`             |

Each kind has bilingual labels (`עמלת בנק`, `ריבית שהתקבלה`, `הפרשי שער`…).
Proposals are data — nothing is written automatically. The operator calls
`addAdjustment(reconId, {kind, amount, bank_entry_id})` to accept.

---

## 7. Balance calculation

```
reconciled_balance = opening_balance
                   + Σ(matched bank entries, signed)
                   + Σ(adjustments, signed)

difference         = statement_closing_balance - reconciled_balance
is_balanced        = |difference| < 0.01
```

`complete(reconId, userId)` refuses to lock the period unless:
1. `unmatched_count === 0`
2. `is_balanced === true`
3. `userId` is a non-empty string

On success the session moves to `STATUS.LOCKED` and every mutating call
(`importStatement`, `loadGLEntries`, `manualMatch`, `undoMatch`,
`addAdjustment`) throws `reconciliation is locked | ההתאמה נעולה`.

---

## 8. Audit trail

Every lifecycle action appends a bilingual entry:

```
start_reconciliation | import_statement | load_gl
auto_match_run       | match_created    | manual_match
undo_match           | adjustment_added | complete
```

Each entry has `{ id, ts, action, label_en, label_he, details }`. The
timestamps are strictly non-decreasing (verified in test 27) and the array
is **never truncated** — `undoMatch` appends a new `undo_match` audit entry
while leaving the original `match_created` entry in place.

---

## 9. Test coverage

```
tests      30
passed     30
failed      0
duration  ~170ms
```

Cases by area:

| Area                                          | Count |
|-----------------------------------------------|------:|
| Session lifecycle (start/import/validation)   |   4   |
| Pass EXACT                                    |   1   |
| Pass DATE_1 (positive + negative)             |   2   |
| Pass DESC_3                                   |   1   |
| Pass ROUNDING                                 |   1   |
| Pass GROUP                                    |   1   |
| Pass SPLIT                                    |   1   |
| Pass FUZZY_DESC                               |   1   |
| Unmatched → proposals                         |   1   |
| Manual match (happy + 2 negatives)            |   3   |
| Undo match (happy + negative)                 |   2   |
| Adjustments (3 variants)                      |   3   |
| Status / complete / lock                      |   4   |
| Suspicious + audit trail                      |   2   |
| Internals (Levenshtein / subset-sum / list)   |   3   |
| **Total**                                     | **30**|

Run:

```
node --test onyx-procurement/test/payroll/bank-reconciliation.test.js
```

Output (tail):

```
✔ 28. Levenshtein & jaccard internals
✔ 29. _findSubsetSum picks an exact subset or returns null
✔ 30. listReconciliations returns summaries only
ℹ tests 30
ℹ pass  30
ℹ fail   0
ℹ duration_ms 170.9
```

Cross-checked against the existing bank test suite:

```
node --test test/bank-matcher.test.js src/bank/multi-format-parser.test.js
→ tests 93, pass 93, fail 0   (no regressions)
```

---

## 10. Defensive behaviour

- `startReconciliation('', …)` → bilingual error
- `startReconciliation(x, null)` → bilingual error
- `period.from > period.to` → bilingual error
- `importStatement(x, 'nope')` → bilingual error
- `manualMatch(x, 'missing', 'b')` → bilingual error
- `manualMatch` refuses to double-book an already-matched entry
- `undoMatch` rejects unknown `matchId` and never removes the record
- `addAdjustment` rejects non-numeric `amount`
- `complete` refuses unless everything is matched AND balanced AND `userId` present
- After lock, every mutator throws `reconciliation is locked | ההתאמה נעולה`
- `_findSubsetSum` returns `null` on impossible targets — no `NaN` leak
- `getReconciliation` returns a deep clone — callers cannot mutate state

---

## 11. Bilingual compliance check

- Every match object → `label_en` + `label_he` (verified in tests 5 & 14)
- Every adjustment → `label_en` + `label_he` (test 19)
- Every audit entry → `label_en` + `label_he` (test 27 sweeps the array)
- Every thrown error → `EN | HE` (tests 2, 4, 15, 18, 21, 23, 24, 25)
- Every pass has a bilingual entry in `PASS_LABELS`

---

## 12. Zero-dep compliance check

`package.json` of `onyx-procurement` was NOT touched. The new module imports
only `node:crypto`. The test file imports only:

- `node:test`
- `node:assert/strict`
- `path`
- the module under test

No new dev- or runtime dependencies were introduced anywhere in the tree.

---

## 13. Sign-off

- Library: implemented, documented inline, zero-dep, non-mutating on read
- Tests: 30/30 passing on Node 18+
- Bilingual: yes, on every label and every error
- Never-delete: yes, `undoMatch` preserves the record
- Integration-ready: consumes Agent 69 parser output verbatim via the
  `{transactions, opening_balance, closing_balance}` envelope
- QA report: this file

**Recommendation:** APPROVE for integration into the AP/treasury reconciliation
UI. Wire `runAutoMatch(reconId)` into the "Auto-match" button,
`getStatus(reconId)` into the dashboard strip (matched/unmatched/difference),
and `complete(reconId, userId)` behind a confirm dialog that lists any
suspicious matches first.
