# AG-X43 — Cost Center Allocation Engine

**Agent**: X-43
**Swarm**: 3C
**Date**: 2026-04-11
**Target**: `onyx-procurement/src/costing/allocation-engine.js` — Techno-Kol Uzi mega-ERP
**Task**: Distribute indirect / overhead costs from service cost centres to
production cost centres using a driver library, with full journal-entry
output for Agent X-39 and Hebrew-bilingual trace for operators.
**Rules respected**: never delete, Hebrew bilingual, zero dependencies.

---

## 1. Summary

Agent X-43 delivered a complete cost-center allocation engine covering all
four industry-standard allocation methods (Direct, Step-down, Reciprocal,
ABC) on a nine-driver seed library. The module runs on plain Node,
has zero external dependencies, emits balanced double-entry journal entries
with Hebrew/English narrations, and is fully exercised by a hand-rolled
18-case test suite — all tests pass.

```
allocation-engine.test.js — Techno-Kol ERP cost-center allocation
---------------------------------------------------------------
Summary: 18 passed, 0 failed, 18 total
```

---

## 2. Deliverables

| # | File | Purpose | LOC |
|---|------|---------|-----|
| 1 | `onyx-procurement/src/costing/allocation-engine.js` | Engine (methods, drivers, JE builder, comparisons) | ~730 |
| 2 | `test/payroll/allocation-engine.test.js` | 18-case test suite, hand-rolled harness | ~430 |
| 3 | `_qa-reports/AG-X43-cost-allocation.md` | This report | — |

---

## 3. Allocation methods

### 3.1 DIRECT (`runDirect`)

Service pools are allocated **directly** to production cost centres only.
Any other service CC in the pool's `cc_list` is filtered out. Driver total
is recomputed over the filtered survivors, so each production CC receives
its full share of the pool.

*Use-case*: simplest, most common in SMEs. Works when services rarely
consume each other's output.

### 3.2 STEPDOWN (`runStepDown`)

Service pools are ordered by descending base amount (largest first). Each
pool allocates to all CCs **except** CCs whose pools have already been
allocated. When a service CC has already received charges from a prior
step, those charges are *added to* its own base before its own allocation
runs (partial reciprocity).

*Use-case*: medium complexity. Partial recognition of inter-service flows.

### 3.3 RECIPROCAL (`runReciprocal`)

The heavy-weight method. Builds a proportion matrix `P` where
`P[i][j] = fraction of service j's pool that would flow into service i`.
Then solves the **simultaneous linear system**:

```
(I - P) · T = C
```

via Gauss-Jordan elimination with partial pivoting (implemented from
scratch, no `numeric.js` or `mathjs`). `T_i` is the total cost to be
allocated out of service `i`, `C_i` is its direct cost. Once `T` is
solved, each service pool is re-allocated to production CCs using the
original driver proportions (full denominator — see conservation proof
below).

*Use-case*: complex organisations with true mutual-services (IT serves
HR, HR serves IT). Mathematically exact.

#### Conservation property

Accounting identity: the sum of amounts landing on production CCs must
equal the sum of **direct** service costs (not `Σ T_i`, which double-counts
inter-service flows). The test `09 RECIPROCAL` asserts exactly this — with
`HR=60000, IT=40000` the production total is `100000.00` to within 1 ₪.

### 3.4 ABC (`runABC`)

Activity-Based Costing. Each pool marked `is_abc: true` computes:

```
rate   = base_amount / Σ activity_consumed
amount = rate × consumer_activity
```

Alternatively, a pre-computed `activity_rate` on the pool overrides the
derivation — in that mode the residual drift fix is deliberately skipped
because the pool base is advisory, not binding. Non-ABC pools fall back
to DIRECT behaviour.

*Use-case*: product costing, make-or-buy analysis, activity-driven
overhead rates.

---

## 4. Driver library (seed)

| id | Hebrew | English | Unit |
|----|--------|---------|------|
| `headcount` | מספר עובדים | Headcount | אנשים |
| `sqm` | מטר רבוע | Floor space | מ"ר |
| `machine_hours` | שעות מכונה | Machine hours | שעות |
| `labor_hours` | שעות עבודה ישירה | Direct labour hours | שעות |
| `revenue` | הכנסות | Revenue | ₪ |
| `orders` | הזמנות שטופלו | Orders processed | הזמנות |
| `computers` | תחנות עבודה | Workstations | תחנות |
| `phone_minutes` | דקות טלפון | Phone minutes | דקות |
| `fixed_percent` | אחוז קבוע | Fixed percentage | % |

The catalog is `Object.freeze`-d; extending it is an immutable edit
(never delete) of the `DRIVER_CATALOG` record.

---

## 5. Exports

### 5.1 Factory

| Export | Purpose |
|--------|---------|
| `createEngine()` | Builds a fresh isolated engine instance with its own state maps |
| `defaultEngine` | Pre-built singleton for simple one-shot usage |

### 5.2 Definers

| Export | Signature | Returns |
|--------|-----------|---------|
| `defineCostCenter(cc)` | `{code, name?, name_he?, type, parent?, id?}` | `ccId` |
| `definePool(pool, cc_list, base_amount)` | pool descriptor, target CC list, ₪ base | `poolId` |
| `setDriver(poolId, ccId, period, value)` | — | `void` |
| `setBudget(ccId, period, amount)` | — | `void` (drives variance analysis) |
| `setPoolBaseForPeriod(poolId, period, amount)` | — | `void` (per-period override) |
| `defineProductLine(productId, ccId, period, revenue)` | — | `void` |

### 5.3 Compute

| Export | Purpose |
|--------|---------|
| `runAllocation(period, method)` | `{runId, allocations[], journal_entries[], trace}` |
| `postJournalEntries(runId, sink?)` | Flags JEs as `POSTED`, invokes sink per entry — hook for Agent X-39 |
| `compareMethod(period, methods[])` | What-if table: per-CC amounts + spread across methods |
| `periodOverPeriod(ccId, periodA, periodB, method?)` | Delta + pct_change between two periods |
| `varianceVsBudget(ccId, period, method?)` | `OVER_BUDGET / UNDER_BUDGET / ON_TARGET` + Hebrew status |
| `productLineProfit(productId, period)` | Revenue, attributed overhead, gross profit, margin |

### 5.4 Introspection (never-delete policy)

| Export | Returns |
|--------|---------|
| `listCostCenters()` | Snapshot array of all CCs |
| `listPools()` | Snapshot array of all pools |
| `listRuns()` | Full history of allocation runs (for audit trail) |
| `listDrivers()` | All `(pool, cc, period, value)` triples |

All reads return shallow copies so callers cannot mutate engine state.

---

## 6. Worked example — the HR 100k case

From the task brief:
```
HR pool = ₪100,000
PROD  = 50 people
SALES = 20 people
ADMIN = 10 people  (total = 80)
```

Expected split (headcount driver):
| CC | Headcount | Share | Amount |
|----|-----------|-------|--------|
| PROD | 50 | 62.5% | ₪62,500.00 |
| SALES | 20 | 25.0% | ₪25,000.00 |
| ADMIN | 10 | 12.5% | ₪12,500.00 |
| **total** | **80** | **100%** | **₪100,000.00** |

Test `05 runAllocation DIRECT — HR 100k split across 3 CCs` asserts this
to within 0.01 ₪. Residual from rounding is pinned to the largest
allocation to keep `Σ amount == base`.

---

## 7. Journal-entry format (Agent X-39 interface)

Each allocation run produces **one JE per pool**. Each JE is a balanced
double-entry document:

```js
{
  id: "JE-ALLOC-000001",
  period: "2026-04",
  date: "2026-04-01",
  method: "DIRECT",
  pool_id: "POOL-0001",
  pool_code: "HR",
  pool_name_he: "מאגר HR",
  dr_total: 100000.00,
  cr_total: 100000.00,
  balanced: true,
  lines: [
    {
      account: "6500-HR",
      account_he: "עלויות אוברהד מוקצות — מאגר HR",
      cost_center: "CC-0001",
      cost_center_he: "ייצור",
      debit:  62500,
      credit: 0,
      narration:    "הקצאת מאגר HR — שיטה: DIRECT",
      narration_en: "Allocate HR — method: DIRECT"
    },
    /* … additional DR lines … */
    {
      account: "6000-HR-CLEAR",
      account_he: "סליקת מאגר — מאגר HR",
      cost_center: "CC-HR",
      cost_center_he: "משאבי אנוש",
      debit:  0,
      credit: 100000,
      narration:    "סליקת מאגר מאגר HR",
      narration_en: "Clear pool HR"
    }
  ],
  posted: false,
  post_status: "PENDING"
}
```

- Every line carries Hebrew **and** English narrations (bilingual rule).
- JEs where `DR === CR` within 0.01 ₪ are flagged `balanced: true`; zero-line
  JEs are dropped rather than emitted as empty entries.
- `postJournalEntries(runId, sink)` marks them `POSTED`, stamps
  `posted_at`, and invokes the caller-supplied sink — Agent X-39 can
  plug in directly as the sink.

---

## 8. Test suite

File: `test/payroll/allocation-engine.test.js`
Runner: hand-rolled assertion harness (`assertEq`, `assertClose`,
`assertTrue`, `assertThrows`, `assertDeepIncludes`). Runs on plain Node
with `node test/payroll/allocation-engine.test.js`.

| # | Case | Method covered | Status |
|---|------|----------------|--------|
| 01 | defineCostCenter persists and returns id | — | OK |
| 02 | defineCostCenter rejects bad input | — | OK |
| 03 | definePool links CCs and rejects unknown CC | — | OK |
| 04 | setDriver writes per (pool, cc, period) | — | OK |
| 05 | runAllocation DIRECT — HR 100k split across 3 CCs | DIRECT | OK |
| 06 | runAllocation emits balanced JEs (DR == CR) | DIRECT | OK |
| 07 | STEPDOWN: largest service pool allocates first | STEPDOWN | OK |
| 08 | STEPDOWN: back-allocation to already-done CC blocked | STEPDOWN | OK |
| 09 | RECIPROCAL: mutual-services solved by linear system | RECIPROCAL | OK |
| 10 | ABC: activity rate + pre-computed rate honored | ABC | OK |
| 11 | compareMethod: per-CC spread across methods | ALL | OK |
| 12 | periodOverPeriod: delta + pct_change | DIRECT | OK |
| 13 | varianceVsBudget: OVER / UNDER / ON_TARGET | DIRECT | OK |
| 14 | productLineProfit: revenue attribution + margin | DIRECT | OK |
| 15 | postJournalEntries: flags posted + calls sink | — | OK |
| 16 | rounding drift: residual pinned to largest, sum == base | DIRECT | OK |
| 17 | Hebrew narration on JE lines (bilingual) | DIRECT | OK |
| 18 | separate engine instances do not share state | — | OK |

**Result**: 18 / 18 pass, 0 failures.

---

## 9. Design decisions

### 9.1 Banker-style rounding

`round2(n)` uses `Math.round((n + Number.EPSILON) * 100) / 100` to avoid
`1.005 → 1.00` traps on binary floats. After dividing a pool across CCs,
any residual (positive or negative) is pinned to the **largest**
allocation so `Σ amount === base` exactly to 2dp.

### 9.2 Full-vs-filtered denominator

`allocatePoolByDriver` takes an `opts.useFullDenominator` flag. When
`false` (default), the denominator is recomputed over survivors after
the `ccFilter` — used for DIRECT where amounts landing on production
should exhaust the pool. When `true`, the denominator stays at the full
cc_list — used for RECIPROCAL where the non-production slice of `T_i`
is already accounted for in other services' `T_j` values. Without this
flag, reciprocal would over-allocate by the inter-service pass-through
(test 09 originally failed with `133333.34 > 100000`).

### 9.3 ABC pre-computed rate

When a pool carries `activity_rate: X`, the derived rate is ignored and
the advisory `base_amount` is **not** forced to match the sum of
`rate × consumption`. This matches real-world practice where an ABC
rate is set annually and the pool refills on demand. The drift-fix
residual push is suppressed to preserve exact `rate × qty` amounts
(test 10 originally pinned the entire `999,000` difference onto PROD-B).

### 9.4 Immutable history

Every `runAllocation` call is appended to the `runs[]` array and never
removed. This powers `periodOverPeriod`, `compareMethod`, and future
audit-trail workflows. `listRuns()` returns a shallow copy so callers
cannot mutate history.

### 9.5 Bilingual by construction

CC names, pool names, JE narrations, variance statuses, and driver
catalog entries all carry both Hebrew (`name_he`, `narration`,
`status_he`) and English (`name`, `narration_en`, `status`) fields.
No single-language surface exists.

---

## 10. Integration points

| Agent | Interface |
|-------|-----------|
| **X-39 (GL posting)** | `postJournalEntries(runId, sink)` — sink is called per JE, returns list of posted entries |
| **X-12 (HR analytics)** | `setDriver(poolId, ccId, period, headcount)` — HR system pushes monthly headcount |
| **X-08 (Inventory)** | `setDriver(poolId, ccId, period, machine_hours)` — manufacturing data feed |
| **Budget module** | `setBudget(ccId, period, amount)` + `varianceVsBudget(...)` |
| **Product P&L** | `defineProductLine(productId, ccId, period, revenue)` + `productLineProfit(...)` |

All hooks are function-call based; no event bus, no queue, no DB. The
engine is fully in-memory by design — persistence is delegated to the
caller.

---

## 11. Rules compliance

| Rule | Evidence |
|------|----------|
| **Never delete** | No `delete`, `truncate`, `removeItem` calls on user data. `listRuns()` exposes full history. The only `delete`s in the code are on internal temp keys (`__POOL_BASE__` restoration after override). |
| **Hebrew bilingual** | Every user-visible string field has both `_he` Hebrew and an English counterpart. See §9.5. |
| **Zero deps** | `module.exports` at the bottom; no `require` of third-party modules. Even Gauss elimination is hand-rolled. |
| **Real math** | `(I - P)·T = C` Gauss-Jordan with partial pivoting, banker-style rounding, residual pinning, full-denominator reciprocal conservation. |

---

## 12. Known limitations / future work

1. **Persistence** — state lives in-memory. Callers must serialize
   `listCostCenters() / listPools() / listDrivers() / listRuns()` to a
   durable store between sessions.
2. **Multi-currency** — all amounts are assumed ILS. Adding FX would
   require a second dimension on pool base and driver values.
3. **Reciprocal solver** is O(n³) in service-CC count. For `n > 50` a
   sparse-matrix approach would be advisable; most Israeli SMEs sit
   comfortably under `n = 10`.
4. **Step-down ordering** uses pool base amount; some literature prefers
   "most other services served" as the tiebreaker. Swappable via
   replacing the single `sort` call.

---

**End of report — AG-X43 / Swarm 3C — 2026-04-11**
