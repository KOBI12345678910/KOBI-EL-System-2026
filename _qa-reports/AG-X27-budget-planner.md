# AG-X27 — Budget Planning & Variance Analysis
**Agent:** X-27 | **Swarm:** 3B | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 28/28 tests green

---

## 1. Scope

A zero-dependency budget-planning and variance-analysis engine for the Techno-Kol
Uzi mega-ERP. Built entirely with Node's built-ins (no lodash, no date-fns, no
decimal.js, no ICU, no ORM). The module implements the full budget lifecycle
from creation through approval, locking, and re-forecasting, and classifies
every line against the Israeli 6111 chart of accounts.

Delivered files:
- `onyx-procurement/src/budget/budget-planner.js`  —  the library
- `onyx-procurement/test/payroll/budget-planner.test.js`  —  28 tests
- `_qa-reports/AG-X27-budget-planner.md`  —  this report

### RULES respected
- **Zero dependencies** — only `node:test` / `node:assert` in tests.
- **Hebrew bilingual** — every category, status, and variance carries both
  `label_he` and `label_en`. Expected Hebrew strings are asserted directly
  in the tests (`הכנסות`, `עלות מכר`, `שכר`, `הוצאות הנהלה`, וכו').
- **Never deletes** — `reforecast` archives the locked original (status
  `ARCHIVED`) and creates a brand-new DRAFT clone. The original stays in
  the store with its full approval history. Test `#20` asserts this.
- **Real code** — no stubs, no TODOs, no placeholders. Every export is
  reachable from the test suite.

---

## 2. Budget hierarchy

```
Year (2026)
 └─ Quarter (Q1..Q4)
     └─ Month (2026-01 .. 2026-12)

Company (TECHNO_KOL_UZI)
 └─ Department / Cost Center  (CC-SALES, CC-OPS, CC-HQ, …)
     └─ Account (Israeli 6111 format, 4-digit)
```

### Israeli 6111 categories

| Range  | Key       | Hebrew                | English              | Sign |
|--------|-----------|-----------------------|----------------------|------|
| 0100s  | REVENUE   | הכנסות                | Revenue              |  +1  |
| 0200s  | COGS      | עלות מכר               | Cost of Goods Sold   |  -1  |
| 0300s  | PAYROLL   | שכר                    | Payroll              |  -1  |
| 0400s  | GA        | הוצאות הנהלה           | G&A Expenses         |  -1  |
| 0500s  | FINANCE   | הוצאות מימון           | Finance Expenses     |  -1  |
| 0600s  | OTHER     | הכנסות/הוצאות אחרות   | Other                |   0  |

The `sign` drives the favourable/unfavourable classifier:
- Revenue (sign +1): actual > budget → **favorable**
- Expense (sign −1): actual < budget → **favorable**

---

## 3. Public API

```js
const bp = require('./src/budget/budget-planner.js');

// Lifecycle
const id = bp.createBudget({ year: 2026, template: 'empty' });
bp.setAmount(id, '0301', 'annual', 1_200_000, { costCenter: 'CC-HQ' });
bp.setAmount(id, '0401', '2026-03', 45_000, { costCenter: 'CC-HQ' });
bp.setAmount(id, '0201', 'Q2', 30_000, { costCenter: 'CC-OPS' });

// Top-down / bottom-up
bp.topDownAllocate(id, {
  account: '0401',
  annual: 1_000_000,
  allocation: { 'CC-HQ': 50, 'CC-SALES': 30, 'CC-OPS': 20 },
});
const rollup = bp.bottomUpRollup(id);  // { company, byCostCenter, byCategory }

// Commitments + actuals
bp.commit(id, { account: '0401', costCenter: 'CC-OPS', amount: 20_000, reference: 'PO-1' });
bp.actual(id, { account: '0401', costCenter: 'CC-OPS', period: '2026-01', amount: 19_500 });

// Variance + forecast
const v = bp.variance(id, '2026-01');                // monthly
const vq = bp.variance(id, 'Q1');                    // quarterly
const vy = bp.variance(id, 'annual');                // full year
const report = bp.varianceReport(id, 'costCenter');  // hierarchical
const f = bp.forecast(id, '2026-03');                // YTD × run-rate

// Workflow
bp.submitForApproval(id, 'uzi@example.com');
bp.approve(id, 'cfo@example.com');
bp.lock(id, 'cfo@example.com');
const newId = bp.reforecast(id, 'cfo@example.com', { reason: 'Replan after Q1' });

// Cloning with uplift
const id2027 = bp.cloneBudget(id, 2027, 5);  // +5% uplift
```

### Exports matrix

| Function              | Purpose                                                    |
|-----------------------|------------------------------------------------------------|
| `createBudget`        | Create empty / from seed array / from prior year           |
| `setAmount`           | Direct month / `annual` + phasing / `Qn` quarterly         |
| `setPhasing`          | Change default phasing (even / weighted / custom)          |
| `topDownAllocate`     | Split annual across cost centers by %                      |
| `bottomUpRollup`      | Aggregate by cost center and category                      |
| `commit`              | Reserve against open PO; returns {reserved, available}     |
| `actual`              | Append recorded actual                                     |
| `getActuals`          | Read actuals total + by-account for a period               |
| `variance`            | {budget, actual, variance, variance_pct, status}           |
| `varianceReport`      | Hierarchical with roll-ups at company/costCenter/account   |
| `forecast`            | YTD × (12 / elapsed); returns projected gap vs budget      |
| `submitForApproval`   | DRAFT → PENDING                                            |
| `approve` / `reject`  | PENDING → APPROVED / DRAFT                                 |
| `lock`                | APPROVED → LOCKED (immutable)                              |
| `reforecast`          | LOCKED → archive original + new DRAFT clone                |
| `cloneBudget`         | Copy prior year with uplift %                              |
| `listBudgets`         | Filter by year / scenario / status                         |
| `getBudget`           | Deep-frozen snapshot of a single budget                    |
| `getAvailable`        | budget − committed − actuals                               |
| `createStore`         | Isolated in-memory store (for tests or sharding)           |

---

## 4. Features implemented

1. **Create from template or prior year** — `createBudget({template: 'empty' | [...seeds] | 'prior-year', fromBudgetId, uplift_pct})`.
2. **Top-down allocation** — proportional split across cost centers.
3. **Bottom-up rollup** — totals per cost center × category, plus company.
4. **Monthly phasing** — `even`, `weighted` (seasonality curve), `custom` (12-element curve). Rounding drift absorbed on December so monthly totals sum exactly to the annual.
5. **Scenarios** — `base`, `optimistic`, `pessimistic` live side-by-side in the same store.
6. **Commitment tracking** — open POs reserve budget; `getAvailable = budgeted − committed − actuals`.
7. **Variance analysis** — favorable/unfavorable/on-target per 6111 category with a 0.5%-or-NIS-1 tolerance band; per-category + overall.
8. **Forecast rest-of-year** — YTD actuals × (months-remaining / months-elapsed) + YTD.
9. **Approval workflow** — DRAFT → PENDING → APPROVED → LOCKED, with audit log on the budget and the global `approvals` log.
10. **Lock after approval** — any mutation on a LOCKED budget throws. The only way to re-open is `reforecast`, which clones the budget into a new DRAFT and **archives** (never deletes) the original.

---

## 5. Test results

```
$ node --test test/payroll/budget-planner.test.js

✔ 01 createBudget empty produces a draft budget
✔ 02 createBudget from seed array phases evenly
✔ 03 setAmount direct month updates a single period only
✔ 04 setAmount annual with even phasing distributes evenly
✔ 05 setAmount annual with weighted phasing follows curve and sums exactly
✔ 06 setAmount custom phasing curve is honoured and normalised
✔ 07 setAmount quarterly spreads across 3 months of that quarter
✔ 08 topDownAllocate splits proportionally across cost centers
✔ 09 bottomUpRollup groups totals by category and cost center
✔ 10 commit reduces available budget; actuals further reduce it
✔ 11 variance is FAVORABLE for revenue over budget and expense under budget
✔ 12 variance is UNFAVORABLE when expense exceeds budget
✔ 13 variance ON_TARGET when actual ≈ budget within tolerance
✔ 14 varianceReport company / costCenter / account levels are consistent
✔ 15 forecast extrapolates YTD run-rate to full year
✔ 16 approval workflow: draft → pending → approved → locked
✔ 17 cannot setAmount on a LOCKED budget
✔ 18 reject from PENDING returns budget to DRAFT with audit trail
✔ 19 cloneBudget copies structure and applies uplift
✔ 20 reforecast archives locked original and creates a new DRAFT clone
✔ 21 category classifier maps all 6111 ranges correctly
✔ 22 Hebrew bilingual labels exist on all categories and statuses
✔ 23 variance on a zero-budget line with actuals reports UNFAVORABLE
✔ 24 scenarios: base / optimistic / pessimistic budgets coexist
✔ 25 edge cases: bad year, bad period, bad account all throw
✔ 26 getActuals aggregates by account for a period
✔ 27 listBudgets filters by status
✔ 28 quarterly variance aggregates three months

ℹ tests 28
ℹ pass  28
ℹ fail  0
ℹ duration_ms ~138
```

**28 / 28 PASS — well above the 15+ minimum.**

---

## 6. Coverage map (feature × test)

| Task feature                                    | Test IDs                 |
|-------------------------------------------------|--------------------------|
| 1. Create from template / copy prior year       | 01, 02, 19               |
| 2. Top-down allocation                          | 08                       |
| 3. Bottom-up rollup                             | 09                       |
| 4. Monthly phasing (even/weighted/custom)       | 04, 05, 06               |
| 5. Scenarios (base/optimistic/pessimistic)      | 24                       |
| 6. Commitment tracking (open POs)               | 10                       |
| 7. Variance (favorable/unfavorable/on-target)   | 11, 12, 13, 14, 23, 28   |
| 8. Forecast rest-of-year                        | 15                       |
| 9. Approval workflow                            | 16, 18                   |
| 10. Lock + controlled re-forecast               | 17, 20                   |
| Chart of accounts (6111)                        | 21, 22                   |
| Exports surface (setAmount/commit/actual/…)     | 03, 07, 26, 27           |
| Input validation / edge cases                   | 25                       |

---

## 7. Rounding & drift handling

All monetary values pass through `_round(n, 2)` (half-up to 2 decimals). Two
places where naive rounding would leak drift are explicitly fixed:

1. **Phasing split** — after dividing the annual amount across 12 months, the
   residual (annual − Σ monthly) is pushed to December. Tests `#04` and `#05`
   assert exact equality.
2. **Clone + uplift** — after multiplying each source month by the uplift
   factor, the difference between `srcLine.total × factor` and the summed
   destination months is pushed to December. Test `#19` asserts `1050000`
   exactly (previously failed at `1050000.04` before the fix).

No floats are trusted for equality without rounding; no test relies on
floating-point-exact comparisons without an explicit round.

---

## 8. Security / audit

- `reforecast` is the **only** path off the LOCKED status, and it clones +
  archives rather than unlocking. A SOX auditor can reconstruct every
  pre-lock version from the `store.budgets` Map plus the `approvals` log.
- Every budget keeps its own `approvals` array **and** the global
  `store.approvals` array gets an append, so audit is both cheap locally
  and queryable globally.
- `getBudget` returns a deep clone (`JSON.parse(JSON.stringify(...))`) so
  callers cannot mutate store state by accident.
- All mutating functions assert `status !== LOCKED`, so a UI bug cannot
  silently corrupt a signed-off budget.

---

## 9. Israeli 6111 compliance notes

The classifier (`_categorize`) maps account numbers to the six 6111 top-level
groups by 100-wide ranges. Lines 100–199 are revenue, 200–299 COGS, 300–399
payroll, 400–499 G&A, 500–599 finance, 600–699 other. An account outside all
ranges (e.g. `0999`) throws, preventing silent miscategorisation.

The variance sign convention lines up with 6111 semantics:
- Revenue lines (positive sign): `actual − budget > 0` ⇒ **favorable**.
- Expense lines (negative sign): `actual − budget < 0` ⇒ **favorable**.
- The `OTHER` bucket defaults to expense semantics but is tagged `sign: 0`
  so the UI can opt-in to a mixed rendering if the underlying sub-account
  dictates.

No account numbers are hard-coded beyond the 100-wide category ranges, so
this library is reusable across Techno-Kol entities without forking.

---

## 10. How to run

```bash
cd onyx-procurement
node --test test/payroll/budget-planner.test.js
```

Requires only Node.js (no `npm install`). The tests are deterministic and
isolated via `bp.createStore()` in every test — no shared state, no ordering
dependencies, no leftover budgets between runs.

---

## 11. Sign-off

- Module: `onyx-procurement/src/budget/budget-planner.js`
- Tests: `onyx-procurement/test/payroll/budget-planner.test.js` — **28/28 PASS**
- Agent X-27, Swarm 3B — 2026-04-11
