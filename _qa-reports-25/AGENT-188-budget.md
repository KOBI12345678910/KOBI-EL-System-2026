# AGENT-188 — Budget Planning Audit

**Agent:** 188 | **Date:** 2026-04-29 | **Status:** PASS — engine green, UI/API gap flagged

Reference: `_qa-reports/AG-X27-budget-planner.md` (Agent X-27, Swarm 3B, 2026-04-11).
Adjacent reports: `AG-Y189-budget-actual.md`, `AG-Y030-sales-forecast.md`,
`AG-Y079-cashflow-forecast.md`, `AG-Y162-forecast-comparator.md`.

---

## 1. Scope

Verify three pillars: **Department budgets** (cost-center hierarchy +
top-down/bottom-up), **Variance analysis** (favorable/unfavorable/on-target
by 6111 category), **Rolling forecasts** (YTD run-rate). Method: re-ran
X-27 engine tests against live source, sampled variance analyzer and
budget-actual modules, traced UI/API surface for wiring gaps.

---

## 2. Engine status — PASS

Live source files (active, not `_merge-incoming/`):

- `onyx-procurement/src/budget/budget-planner.js` — **1,149 LOC**
- `onyx-procurement/test/payroll/budget-planner.test.js` — **507 LOC**
- `onyx-procurement/src/reporting/budget-actual.js` — **772 LOC** (Y-189 follow-on)
- `onyx-procurement/src/reporting/variance-analyzer.js` — **945 LOC** (Y-185 4-layer textbook decomposition)

Re-ran tests under `onyx-procurement/`:

```
node --test test/payroll/budget-planner.test.js
ℹ tests 28   ℹ pass 28   ℹ fail 0   ℹ duration_ms 1640
```

All 28 tests green, matching the X-27 baseline. Zero regressions.

---

## 3. Department budgets — VERIFIED

**Hierarchy** (planner.js:8-11): `Year → Quarter → Month` x `Company →
Department/Cost Center → Account (6111 4-digit)`.

**Top-down** (`topDownAllocate`, line 427): proportional split across cost
centers by percentage map. Test #08 asserts proportional allocation.

**Bottom-up** (`bottomUpRollup`, line 450): aggregates by cost center AND by
6111 category, plus full-company totals. Test #09 verifies cross-axis
consistency.

**Phasing** (line 327, `_applyPhasing`): three modes — `even`, `weighted`
(seasonality curve), `custom` (12-element array). Rounding drift absorbed on
December so monthly totals = annual exactly. Tests #04, #05, #06 cover all
three modes; explicit float-drift fix at line 327-355.

**Scenarios** (line 265): `base`, `optimistic`, `pessimistic` coexist in a
single store. Test #24 confirms isolation.

**6111 categories**: 6 ranges (REVENUE/COGS/PAYROLL/GA/FINANCE/OTHER), each
with `label_he` + `label_en` + sign for variance polarity. Hard-fail on
out-of-range accounts (test #25). No silent miscategorisation.

---

## 4. Variance analysis — VERIFIED

**Classifier** (`_classifyVariance`, line 624): tolerance band of `max(0.5%
of budget, NIS 1)`; below = `ON_TARGET`. Sign convention follows category
direction:
- Revenue (sign +1): actual > budget → FAVORABLE
- Expense (sign -1): actual < budget → FAVORABLE
- Zero-budget line with actuals → UNFAVORABLE (test #23 — degenerate case
  handled correctly).

**Scopes** (`variance`, line 651): monthly (`2026-01`), quarterly (`Q1`,
test #28 aggregates 3 months), annual. Returns
`{budget, actual, variance, variance_pct, status, byCategory}`.

**Hierarchical report** (`varianceReport`, line 744): emits company /
costCenter / account levels with internal consistency (sum of leaves =
parent). Test #14 cross-checks all three levels.

**Deep variance decomposition** present in
`onyx-procurement/src/reporting/variance-analyzer.js` (Y-185): the four
classical managerial-accounting layers — sales price/volume, sales mix,
labor rate/efficiency, material price/usage — with bilingual narratives.
This is a separate but compatible module the budget engine can call.

---

## 5. Rolling forecast — VERIFIED with caveat

**Algorithm** (`forecast`, line 794): per category,
`runRate = ytdActual / monthsElapsed`,
`projection = ytdActual + runRate × monthsRemaining`,
`gapToBudget = projection − annualBudget`. Test #15 asserts arithmetic.

**Outputs**: `{ytdActual, annualBudget, projectedAnnual, projectedGap,
byCategory{runRate, projection, gapToBudget, label_he, label_en}}`.

**Caveats**:
1. Pure straight-line extrapolation. No seasonality respect on the
   forecast side even though phasing supports `weighted`/`custom` curves.
   Recommend: blend `runRate` with the residual curve weight for remaining
   months (so that a December-heavy revenue line is not under-projected
   from a Q1 run-rate). **MINOR — not blocking.**
2. Forecast does not consume committed-but-not-actual POs into the
   projection. `getAvailable` does (`budget − committed − actuals`), but
   `forecast()` ignores commitments. Recommend a `mode: 'cash' | 'commit'`
   flag. **MINOR — not blocking.**

---

## 6. Workflow & immutability — VERIFIED

State machine (lines 880-1002): `DRAFT → PENDING → APPROVED → LOCKED`,
with `reject` returning to DRAFT and `reforecast` cloning a LOCKED
budget into a new DRAFT (status of original becomes `ARCHIVED` — never
deleted). Tests #16, #17, #18, #20 cover the full path.

Every mutating function (`setAmount`, `commit`, `actual`, `topDownAllocate`,
`setPhasing`) asserts `status !== LOCKED`. SOX-grade: a UI bug cannot
silently corrupt a signed-off budget.

`getBudget` returns a deep clone (`JSON.parse(JSON.stringify(...))`) so
external callers cannot mutate store state.

---

## 7. Surface gap — UI / API integration

The engine is library-only. No live API route or live ERP page consumes it
yet — all consumer code (department budgets UI, budget-vs-actual page,
project budget page, marketing budget) lives under `_merge-incoming/`,
i.e. is staged-but-not-merged into the active tree:

- `_merge-incoming/.../erp-app/src/pages/finance/budget-departments.tsx`
- `_merge-incoming/.../erp-app/src/pages/finance/budget-vs-actual.tsx`
- `_merge-incoming/.../erp-app/src/pages/finance/budgets.tsx`
- `_merge-incoming/.../api-server/src/routes/budgets.ts`
- `_merge-incoming/.../api-server/src/routes/budget-approval.ts`

**Required to satisfy CLAUDE.md "No Dead Pages Rule"**:
1. Wire `Finance360` (P0 page per CLAUDE.md) to expose budget tiles using
   `bp.varianceReport(id, 'company')` + `bp.forecast(id, asOf)`.
2. Add an entity-map entry for `Budget` (currently absent in the 16-entity
   map per `AGENT-27-entity-map.md`).
3. Register state machine for budget in `state-machines.js` (DRAFT →
   PENDING → APPROVED → LOCKED → ARCHIVED) so the orchestrator can issue
   `submitForApproval`/`approve`/`lock`/`reforecast` actions.
4. Expose `/api/budgets/*` route group via `wiring-spec.js`.

---

## 8. Israeli compliance

6111 chart of accounts mapped strictly by 100-wide ranges (`_categorize`,
line 190). Out-of-range accounts throw, preventing miscategorisation.
Hebrew labels asserted directly in test #22 (`הכנסות`, `עלות מכר`, `שכר`,
`הוצאות הנהלה`, `הוצאות מימון`). Aligns with `AGENT-19-il-compliance.md`.

---

## 9. Verdict

| Area                    | Status        |
|-------------------------|---------------|
| Engine correctness      | PASS (28/28)  |
| Department budgets      | PASS          |
| Variance analysis       | PASS          |
| Rolling forecast        | PASS (caveats)|
| Approval / lock / audit | PASS          |
| 6111 / Hebrew bilingual | PASS          |
| API + UI wiring         | GAP — staged in `_merge-incoming/` only |
| Entity map registration | GAP — Budget not in 16-entity map |

**Overall: PASS for the engine; one P1 wiring task to surface budgets in
the active ERP shell (Finance360, entity-map, state-machine, route group).**

---

## 10. Recommended follow-ups

1. **P1** Promote `_merge-incoming/.../finance/budget-*.tsx` and
   `_merge-incoming/.../api-server/src/routes/budgets.ts` into
   `techno-kol-ops/` and wire to `bp` exports.
2. **P1** Register `Budget` entity in `entity-map.js` with statuses
   `DRAFT|PENDING|APPROVED|LOCKED|ARCHIVED` and primary actions matching
   the 4 workflow transitions.
3. **P2** Forecast: add seasonality-aware projection (use phasing curve
   for remaining months instead of flat run-rate).
4. **P2** Forecast: optional `mode: 'commit'` to net committed POs into
   the projection, mirroring `getAvailable`.

---

**Sign-off:** Agent 188 — 2026-04-29. Sources: `budget-planner.js`,
`budget-planner.test.js`, `variance-analyzer.js`, `budget-actual.js`.
