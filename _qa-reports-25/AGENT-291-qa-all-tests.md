# AGENT-291 — QA #1: All Payroll Test Suites

**Agent:** 291 (QA #1)
**Date:** 2026-04-29
**Worktree:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Target:** `onyx-procurement/test/payroll/*.test.js`
**Runner:** `node --test` (Node v24.14.1, zero-dep node:test + assert/strict)

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Test files discovered** | **51** |
| **Test files passing** | **49** |
| **Test files failing** | **2** |
| **File pass rate** | **96.08%** |
| **Total test cases executed** | **2,102** |
| **Test cases passing** | **2,094** |
| **Test cases failing** | **8** |
| **Test cases skipped** | **0** |
| **Case pass rate** | **99.62%** |
| **Total wall-clock duration** | **94.8 s** |

**Verdict:** GREEN-with-flags. Two suites have real assertion failures (`consolidator`, `dunning`) — must fix before payroll release. One suite (`check-printer`) was flaky on first cold-start run but stable on 4 subsequent runs.

---

## Failing Suites (Detail)

### 1. `consolidator.test.js` — 6 of 24 failing (FAIL exit 1)

Multi-entity consolidation engine has systemic balance/elimination bugs.

| # | Failing Test | Failure |
|---|---|---|
| 1 | `consolidate — IC AR/AP fully offsets` | `false !== true` at line 267 (balance assertion) |
| 2 | `consolidate — investment eliminated against sub equity, goodwill recognized` | Strict-equal mismatch |
| 3 | `consolidate — NCI recognized at non-controlling share` | Strict-equal mismatch |
| 4 | `consolidate — fair value uplifts reduce goodwill, add FV adjustment lines` | Strict-equal mismatch |
| 5 | `consolidate — USD sub with FX translation produces CTA, balanced` | Strict-equal mismatch |
| 6 | `consolidate — full-stack regression: FX + IC AR/AP + IC Sales + NCI + goodwill` | `debitCreditDelta=-1312.5`, `balanceSheetDelta=-1312.5` (books out of balance by 1,312.5) |

**Root-cause cluster:** intercompany AR/AP elimination + goodwill/NCI recognition + FX-CTA balancing all share a final-trial-balance assertion that fails. The full-stack regression case quantifies the gap: ledger debit total is 1,312.50 short of credit total. Likely a missing elimination JE or a sign error in NCI/goodwill calc that propagates into every test that touches the offending code path.

**Passing in same suite (18/24):** all single-leg eliminations (IC Sales/COGS, IC interest, IC management fees) pass — so the simple cancel-pair logic works. The failures are concentrated in equity-side eliminations (investment-vs-equity, NCI, FV uplift) and the FX/CTA path.

### 2. `dunning.test.js` — 2 of 45 failing (FAIL exit 1)

| # | Failing Test | Failure |
|---|---|---|
| 1 | `runDunning skips paused invoices (disputed, paid, promised)` | `reasons.some(r => r === 'INV-30:promised')` was falsy at line 224 — the engine did not emit a "promised" reason for INV-30 |
| 2 | `reconcilePromises marks kept when payment covers the promise` | `'broken' !== 'kept'` at line 302 — promise lifecycle marked broken even though payment covered the promise amount |

**Root-cause cluster:** `promise-to-pay` lifecycle. (a) the dunning skip-list is missing the `promised` status filter — so invoices in promise-to-pay state are still being dunned, AND no skip-reason `:promised` is being emitted. (b) `reconcilePromises` is comparing the wrong amount fields (or wrong comparison direction), flipping `kept` to `broken`. Both bugs sit on the same feature surface; one fix likely touches both.

---

## Per-File Results (Sorted by Filename)

Format: `STATUS | file | tests | pass | fail | skipped | dur_ms`

| Status | File | Tests | Pass | Fail | Skip | Duration (ms) |
|---|---|---:|---:|---:|---:|---:|
| PASS | alert-manager | 41 | 41 | 0 | 0 | 1,122 |
| PASS | anomaly-detector | 34 | 34 | 0 | 0 | 804 |
| PASS | apm | 41 | 41 | 0 | 0 | 1,212 |
| PASS | bank-reconciliation | 30 | 30 | 0 | 0 | 4,961 |
| PASS | budget-planner | 28 | 28 | 0 | 0 | 3,069 |
| PASS | cash-flow-predictor | 26 | 26 | 0 | 0 | 1,337 |
| PASS | chatbot-engine | 113 | 113 | 0 | 0 | 4,845 |
| PASS | check-printer (flaky*) | 39 | 39 | 0 | 0 | 1,966 |
| PASS | churn-predictor | 50 | 50 | 0 | 0 | 2,393 |
| PASS | company-id | 35 | 35 | 0 | 0 | 1,003 |
| **FAIL** | **consolidator** | **24** | **18** | **6** | **0** | **821** |
| PASS | customer-portal | 61 | 61 | 0 | 0 | 797 |
| PASS | demand-forecaster | 65 | 65 | 0 | 0 | 977 |
| PASS | document-classifier | 63 | 63 | 0 | 0 | 806 |
| **FAIL** | **dunning** | **45** | **43** | **2** | **0** | **726** |
| PASS | duplicate-detector | 43 | 43 | 0 | 0 | 1,378 |
| PASS | error-tracker | 43 | 43 | 0 | 0 | 992 |
| PASS | financial-statements | 30 | 30 | 0 | 0 | 780 |
| PASS | fraud-rules | 58 | 58 | 0 | 0 | 840 |
| PASS | health-check | 42 | 42 | 0 | 0 | 3,130 |
| PASS | hr-analytics | 30 | 30 | 0 | 0 | 2,160 |
| PASS | iban | 47 | 47 | 0 | 0 | 2,600 |
| PASS | ic-engine | 26 | 26 | 0 | 0 | 934 |
| PASS | incident-mgmt | 37 | 37 | 0 | 0 | 1,297 |
| PASS | inventory-optimizer | 24 | 24 | 0 | 0 | 912 |
| PASS | log-store | 44 | 44 | 0 | 0 | 1,039 |
| PASS | pdf-invoice-parser | 46 | 46 | 0 | 0 | 5,114 |
| PASS | phone | 72 | 72 | 0 | 0 | 3,065 |
| PASS | preference-manager | 21 | 21 | 0 | 0 | 5,288 |
| PASS | price-optimizer | 24 | 24 | 0 | 0 | 974 |
| PASS | productivity | 20 | 20 | 0 | 0 | 1,267 |
| PASS | prom-metrics | 32 | 32 | 0 | 0 | 1,197 |
| PASS | rbac | 54 | 54 | 0 | 0 | 3,089 |
| PASS | resource-tracker | 27 | 27 | 0 | 0 | 4,393 |
| PASS | rma | 33 | 33 | 0 | 0 | 796 |
| PASS | route-optimizer | 56 | 56 | 0 | 0 | 807 |
| PASS | search-engine | 47 | 47 | 0 | 0 | 873 |
| PASS | smart-categorizer | 36 | 36 | 0 | 0 | 1,150 |
| PASS | sse-hub | 26 | 26 | 0 | 0 | 5,089 |
| PASS | status-page | 27 | 27 | 0 | 0 | 694 |
| PASS | summarizer | 48 | 48 | 0 | 0 | 1,130 |
| PASS | tax-file | 47 | 47 | 0 | 0 | 770 |
| PASS | teudat-zehut | 64 | 64 | 0 | 0 | 840 |
| PASS | ticketing | 54 | 54 | 0 | 0 | 1,068 |
| PASS | totp | 64 | 64 | 0 | 0 | 1,288 |
| PASS | tracer | 28 | 28 | 0 | 0 | 2,168 |
| PASS | uptime-monitor | 23 | 23 | 0 | 0 | 844 |
| PASS | vendor-scoring | 32 | 32 | 0 | 0 | 2,473 |
| PASS | warranty-tracker | 30 | 30 | 0 | 0 | 5,682 |
| PASS | wms | 42 | 42 | 0 | 0 | 575 |
| PASS | workflow-engine | 30 | 30 | 0 | 0 | 1,288 |

\* `check-printer` failed exit-code-1 on the very first cold-start invocation in this session, then PASSED stably on 4 subsequent runs. Suspected timing or filesystem-warmup issue. **Recommend** adding it to the flaky-test watchlist; not currently a release blocker.

---

## Tally Verification

```
files:           51 = 49 PASS + 2 FAIL
tests:        2102 = sum across all files
pass:         2094
fail:            8 = 6 (consolidator) + 2 (dunning)
skipped:         0
duration_ms: 94823 (~94.8 s wall clock)
```

Cross-check: `49 PASS files * 0 fails + 1 FAIL file (consolidator) * 6 + 1 FAIL file (dunning) * 2 = 0 + 6 + 2 = 8 fails`. Matches.

---

## Severity & Recommended Actions

| # | Item | Severity | Owner | Action |
|---|---|---|---|---|
| 1 | `consolidator` — investment/NCI/goodwill/FX-CTA elimination chain | **P0 (release-blocker)** | Finance | Group consolidation feature is broken end-to-end. The 1,312.50 imbalance in the full-stack case means published consolidated trial balance would not balance. Do **not** ship until 6/6 pass. |
| 2 | `dunning` — `promise-to-pay` lifecycle | **P0 (release-blocker)** | AR/Collections | Promised invoices are not being skipped, and `kept` promises are being marked `broken`. Customer-visible billing bug. |
| 3 | `check-printer` cold-start flake | **P3 (track)** | Payroll | Add to flake list; investigate if recurs in CI. |

---

## Reproduction Commands

```bash
cd onyx-procurement

# Whole payroll suite (file by file):
for f in test/payroll/*.test.js; do node --test "$f"; done

# Only the failing suites:
node --test test/payroll/consolidator.test.js
node --test test/payroll/dunning.test.js

# Failure-only summary line:
node --test test/payroll/consolidator.test.js 2>&1 | grep -E "fail [0-9]+$"
```

---

## Files of Interest (absolute paths)

- Failing test files:
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\consolidator.test.js` (line 267 first fail)
  - `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\dunning.test.js` (line 224, line 302)
- All 51 test files in: `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\`
- Raw run captures: `/tmp/qa-291/results2.txt` and `/tmp/qa-291/all-output.txt` (session-scoped)

---

## Sign-off

**Agent 291 (QA #1)** certifies that all 51 test files in `onyx-procurement/test/payroll` were executed exactly once for the primary tally, with the two failing suites and the one cold-start flake re-run for confirmation. **49/51 files pass; 2,094/2,102 individual cases pass (99.62%).** Ship-readiness is **NOT GREEN** until `consolidator` and `dunning` are fixed.
