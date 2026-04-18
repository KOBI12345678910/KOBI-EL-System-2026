# AG-Y017 — Sales Commission Engine (Tiered / Accelerator / Split / Clawback)
**Agent:** Y-017 | **Swarm:** Sales | **Project:** Techno-Kol Uzi mega-ERP 2026
**Date:** 2026-04-11
**Status:** PASS — 31/31 tests green

---

## 1. Scope

A zero-dependency sales commission engine for Kobi Elkayam's Mega-ERP.
Handles flat / tiered / accelerator plans, splits between multiple
salespeople, manager team overrides, caps, floors, draws against
commission, clawbacks on unpaid/late invoices, pipeline forecasting
and a bilingual Hebrew+English commission statement (plain-text PDF).

Delivered files
- `onyx-procurement/src/sales/commission.js` — engine (~900 LOC)
- `test/sales/commission.test.js` — 31 tests (9 suites)
- `_qa-reports/AG-Y017-commission.md` — this report

RULES respected
- **לא מוחקים רק משדרגים ומגדלים** — `definePlan` with an existing
  id bumps `version` and pushes the previous plan into
  `_planHistory`. Assignments stamp `endDate` on the prior row,
  never delete it. Clawbacks append *negative* entries to the same
  calculations log instead of mutating prior rows. Test 30 verifies
  there is no `deletePlan`, `deleteAssignment`, or `deleteCalculation`
  function on the engine.
- Zero external dependencies (only Node built-ins — `Buffer`,
  `TextEncoder`).
- Bilingual labels on every plan type, role, and reason
  (`PLAN_TYPE_LABELS`, `ROLE_LABELS`, `REASON_LABELS`).
- Real code, no stubs.

---

## 2. Public API

```js
const { CommissionEngine } = require('onyx-procurement/src/sales/commission.js');
const eng = new CommissionEngine({ now });
```

| method | purpose |
|---|---|
| `definePlan(spec)` | create/upgrade a plan, returns `planId` |
| `assignPlan(salespersonId, planId, effectiveDate)` | assign plan to rep; stamps endDate on previous active assignment |
| `calculate({salesperson, period, sales, plan?})` | per-deal + totals for a period |
| `applySplit(deal, splitRules)` | apply split rules to one deal, returns shares |
| `applyClawback(salesperson, period)` | reverse commissions for overdue/unpaid invoices |
| `forecast({salesperson, pipeline, plan?})` | probability-weighted pipeline commission estimate |
| `generateStatement(salesperson, period)` | returns `{ buffer, body, filename, mime }` — bilingual PDF |
| `listPlans()` / `getPlan(id)` | introspection |
| `listAssignments(salespersonId?)` | assignment history |
| `listCalculations(salespersonId?, period?)` | calc log (append-only) |
| `listClawbacks()` | clawback log |
| `outstandingDraw(salespersonId)` | current draw balance owed |
| `snapshot()` | deep-cloneable state dump |

All list methods return shallow clones — mutating the result cannot
change internal state (verified in test 30).

---

## 3. Plan types

### 3.1 Flat
Single rate on every Shekel of the salesperson's share.
```js
{ id:'FLAT-5', name:'Flat 5%', type:'flat', rate:0.05 }
```

### 3.2 Tiered (marginal brackets)
Only the portion of sales that falls inside each tier's `[from, to)`
window is taxed at that tier's rate. Tiers must be contiguous
(validated at `definePlan` — test 04 rejects non-contiguous tiers).

```js
{
  id:'TIER-1', name:'Tiered', type:'tiered',
  tiers:[
    { from: 0,      to: 100000,   rate: 0.03 },
    { from: 100000, to: 250000,   rate: 0.05 },
    { from: 250000, to: Infinity, rate: 0.08 },
  ],
}
```

Examples (test 11–13):
| Sales | Calculation | Commission |
|---|---|---|
| 100,000 | 100k × 3% | **3,000** |
| 150,000 | 100k × 3% + 50k × 5% | **5,500** |
| 300,000 | 100k × 3% + 150k × 5% + 50k × 8% | **14,500** |

### 3.3 Accelerator (quota)
Below `quota`, each Shekel pays `baseRate`. Every Shekel above quota
pays `acceleratorRate`. If a single deal straddles the quota
boundary (when added to the running period total), it is split —
part at baseRate, part at acceleratorRate (test 15).

```js
{
  id:'ACC-1', name:'Accelerator', type:'accelerator',
  quota: 200000,
  baseRate: 0.05,
  acceleratorRate: 0.08,
}
```

Example (test 15):
- D1: 150k @ 5% = 7,500 *(running sales = 150k, under quota)*
- D2: 100k split → 50k @ 5% + 50k @ 8% = 2,500 + 4,000 = **6,500**
- Total commission: **14,000**
- `totals.acceleratorApplied = true`

Validation: `acceleratorRate` must be ≥ `baseRate` (test 06).

---

## 4. Split rules syntax

A deal can be split between many salespeople (seller, Sales Engineer,
manager, channel partner). Format:

```js
splitRules: [
  { salespersonId: 'S001', role: 'seller',  pct: 0.70 },
  { salespersonId: 'E010', role: 'se',      pct: 0.20 },
  { salespersonId: 'M100', role: 'manager', pct: 0.10, override: true },
]
```

Where to declare split:
1. **On the plan** (`splitRules` — applies to every deal for that plan)
2. **On the deal** (`deal.split`) — overrides plan rules for that single
   deal (test 19).

Validation (`validateSplitSum`):
- Each row's `pct` must be in `[0, 1]`.
- The sum of all non-override `pct` values must equal `1.0000`
  (tolerance: `0.0001`). Otherwise `E_SPLIT_NOT_100` is thrown.
- `override: true` rows are **additive** — they do not count toward
  the 100% sum (test 20) so the seller's slice is never reduced by
  a manager override. Manager overrides are paid from a separate
  "team override" pool and reported on `totals.overrideAmount`.

Roles (`ROLE_LABELS`):
- `seller` / איש מכירות
- `se` / מהנדס מכירות
- `manager` / מנהל
- `partner` / שותף עסקי
- `overlay` / תומך מכירות

---

## 5. Clawback logic

Each deal carries `closedDate` (revenue booked) and `paidDate`
(customer actually paid the invoice). The plan carries
`clawbackPeriodDays` — an integer grace period.

`applyClawback(salesperson, period)` walks every `sale`-reason row
for that salesperson in the period and evaluates:

```
if paidDate is null:
    diff = now - closedDate
    if diff > clawbackPeriodDays  →  reason = 'unpaid_overdue'
elif paidDate is present:
    diff = paidDate - closedDate
    if diff > clawbackPeriodDays  →  reason = 'paid_late'
```

For each overdue row the engine appends a *new* calculation row with:
- `commission: -Math.abs(originalCommission)` (negative)
- `reason: 'clawback'`
- `sourceCalcId: <original row id>`
- `clawbackReason: 'unpaid_overdue' | 'paid_late'`

The original row is untouched. Calling `applyClawback` twice is
idempotent — the second call returns `[]` because it skips rows
that already have a clawback pointing at them (test 24).

Tests:
- **Test 24** — `clawbackPeriodDays: 60`, invoice unpaid, clock advanced
  90 days → clawback of −5,000, reason `unpaid_overdue`. Second call
  returns `[]`.
- **Test 25** — `clawbackPeriodDays: 30`, invoice paid 46 days after
  closing → clawback of −2,500, reason `paid_late`.
- **Test 26** — invoice paid 51 days after closing with
  `clawbackPeriodDays: 60` → no clawback.

---

## 6. Cap / Floor / Draw

- **Cap** (`plan.cap`): hard ceiling on commission per period. Gross
  above cap is clipped; `totals.grossCommission` still reflects the
  un-capped amount, `totals.commissionAfterCap` the paid amount,
  and `totals.capApplied = true` (test 21).
- **Floor** (`plan.floor`): minimum commission per period. If gross
  is below the floor, the payout is raised; `floorApplied = true`
  (test 22).
- **Draw** (`plan.draw`): guaranteed monthly advance. Works both
  directions (test 23):
  - *Advance*: if `netPayable < draw`, the engine tops up to `draw`
    and pushes the delta onto the `_drawLedger` (outstanding draw owed).
  - *Recovery*: next period's commission is first offset against
    the outstanding draw (but never below zero).
  - `outstandingDraw(salespersonId)` surfaces the current balance.

---

## 7. Forecast semantics

```js
eng.forecast({
  salesperson: 'S1',
  pipeline: [
    { id:'P1', amount:100000, probability:0.5, customer:'Acme' },
    { id:'P2', amount:200000, probability:0.25, customer:'Globex' },
  ],
});
```

For each pipeline deal, `expectedAmount = amount × probability`.
The engine runs those expected amounts through the salesperson's
active plan in order, tracking a running total so that accelerator
plans correctly cross the quota boundary (test 28).

Returned shape:
```js
{
  salespersonId, planId, planName, asOf,
  dealCount, grossForecast, total, capApplied,
  perDeal: [{ dealId, customer, amount, probability,
              expectedAmount, weightedCommission, acceleratorApplied }],
}
```

Draw and outstanding-draw ledger are **not** applied in `forecast`
(forecast is an estimate, draw is a cash-flow event).

---

## 8. Bilingual statement (`generateStatement`)

Zero-dep, single-page PDF with a plain-text body in Courier 9pt,
composed of:

1. **Hebrew block (RTL)** —
   `דוח עמלות`, deal detail table with `סיבה` column
   (`מכירה`, `שלילת עמלה`, etc.), and totals for
   `סך עמלה ברוטו`, `שלילות`, `סך לתשלום נטו`.
2. Separator line.
3. **English block (LTR)** — `COMMISSION STATEMENT`, same table,
   with totals for `Gross commission`, `Clawbacks`, `Net payable`.

Return value:
```js
{
  buffer,   // Buffer, valid application/pdf
  body,     // raw text (for tests / email inline / html mirror)
  filename, // 'commission-S001-2026-01-01_2026-03-31.pdf'
  mime,     // 'application/pdf'
}
```

Test 29 asserts: both language blocks present, `%PDF-` magic header,
`application/pdf` mime, and customer name appears in body.

The PDF builder is a hand-rolled PDF 1.4 skeleton (Catalog / Pages /
Page / Contents / Font /Courier). No external libs.

---

## 9. Plan versioning (never-delete)

```js
eng.definePlan({ id:'P1', type:'flat', rate:0.05 });
eng.definePlan({ id:'P1', type:'flat', rate:0.07 });
// → v1 moved into _planHistory.get('P1'), v2 is now active
eng.getPlan('P1').version === 2
```

Old versions remain queryable via `snapshot()`. Calculations stamp
the `planVersion` used so historical payouts remain reproducible
even after a plan is bumped.

---

## 10. Test matrix (`test/sales/commission.test.js`)

All 31 tests run in ~140 ms with `node --test`.

| # | Suite | Case |
|---|---|---|
| 01 | plan definition | defines a flat plan |
| 02 | plan definition | rejects flat plan without rate |
| 03 | plan definition | defines a tiered plan |
| 04 | plan definition | rejects tiered plan with gaps |
| 05 | plan definition | defines accelerator |
| 06 | plan definition | rejects accelerator with accRate < baseRate |
| 07 | plan definition | redefining bumps version (never delete) |
| 08 | assignment | assigns and looks up active plan |
| 09 | assignment | transition stamps endDate on previous |
| 10 | assignment | rejects assignment against unknown plan |
| 11 | tier math | exact first tier top (3,000) |
| 12 | tier math | crossing first and second tier (5,500) |
| 13 | tier math | crossing all three tiers (14,500) |
| 14 | accelerator | below quota → base rate only |
| 15 | accelerator | second deal splits base + accelerator (14,000) |
| 16 | accelerator | entirely above quota → accelerator rate |
| 17 | split | applySplit sums to 100% |
| 18 | split | rejects split that doesn't sum to 100% |
| 19 | split | deal-level split overrides plan splitRules |
| 20 | split | manager override is additive |
| 21 | cap/floor/draw | cap enforced |
| 22 | cap/floor/draw | floor enforced |
| 23 | cap/floor/draw | draw advance + recovery across 2 months |
| 24 | clawback | unpaid invoice past window, idempotent |
| 25 | clawback | paid-late invoice |
| 26 | clawback | no clawback when paid within window |
| 27 | forecast | pipeline probability weighting |
| 28 | forecast | accelerator pipeline crosses quota |
| 29 | statement | bilingual PDF (HE + EN) with valid magic |
| 30 | never-delete | calc log append-only, no delete fns |
| 31 | never-delete | exported bilingual label maps |

```
ℹ tests 31
ℹ suites 9
ℹ pass 31
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 138.797
```

---

## 11. Worked example — end-to-end

```js
const { CommissionEngine } = require('./commission');
const eng = new CommissionEngine();

// 1. Define tiered plan with cap and clawback window
eng.definePlan({
  id: 'TIER-2026',
  name: 'Q1 2026 Tiered',
  type: 'tiered',
  tiers: [
    { from: 0,      to: 100000, rate: 0.03 },
    { from: 100000, to: 250000, rate: 0.05 },
    { from: 250000, to: Infinity, rate: 0.08 },
  ],
  cap: 50000,
  clawbackPeriodDays: 60,
  splitRules: [
    { salespersonId: 'S001', role: 'seller', pct: 0.80 },
    { salespersonId: 'E001', role: 'se',     pct: 0.20 },
  ],
});

// 2. Assign to S001 as of start of quarter
eng.assignPlan('S001', 'TIER-2026', '2026-01-01');

// 3. Calculate for Q1
const result = eng.calculate({
  salesperson: 'S001',
  period: { from: '2026-01-01', to: '2026-03-31' },
  sales: [
    { id: 'D1', amount: 150000, margin: 0.4, productGroup:'SW',
      customer: 'Acme', closedDate: '2026-01-20', paidDate: '2026-02-10' },
    { id: 'D2', amount: 200000, margin: 0.3, productGroup:'HW',
      customer: 'Globex', closedDate: '2026-02-15', paidDate: null },
  ],
});
// result.totals = {
//   dealCount: 2,
//   totalSales: 280000, // 80% of 350k
//   grossCommission, commissionAfterCap, capApplied, ...
// }

// 4. Run clawback after 90 days — D2 is still unpaid
eng.applyClawback('S001',
  { from: '2026-01-01', to: '2026-04-15' });
// → [{ dealId:'D2', amount: -8000, reason:'unpaid_overdue' }]

// 5. Statement PDF
const stmt = eng.generateStatement('S001',
  { from: '2026-01-01', to: '2026-03-31' });
// write stmt.buffer to disk / email attachment
```

---

## 12. Files touched

| file | role |
|---|---|
| `onyx-procurement/src/sales/commission.js` | engine — new |
| `test/sales/commission.test.js` | 31 tests — new |
| `_qa-reports/AG-Y017-commission.md` | this report — new |

No existing files were modified or deleted.

## 13. Sign-off

- **31 / 31** tests passing
- Zero external deps (`package.json` untouched)
- Rule `לא מוחקים רק משדרגים ומגדלים` respected in code + tests
- Bilingual labels exported for every plan type, role, and reason
- Commission statement PDF validated with `%PDF-` magic + body assertions

**Status: READY** — safe to merge into master.
