# AG-Y071 — Compensation Planner (CompPlanner)

**Agent:** Y-071
**Module:** `onyx-procurement/src/hr/comp-planner.js`
**Tests:** `onyx-procurement/test/hr/comp-planner.test.js`
**Status:** PASS — 30/30 tests green
**Rule Enforced:** לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Date:** 2026-04-11
**Dependencies:** Zero (pure Node, standard `Intl`, `assert`)
**Language:** Bilingual HE / EN throughout

---

## 1. Purpose

A full-lifecycle compensation planning engine for the Techno-Kol Uzi
mega-ERP: salary band design, compa-ratio analysis, merit-matrix
budget allocation, Israeli market benchmarking, total-rewards
calculation, pay-equity audit, compression detection, hire-rate
guardrails, budget tracking, and formal Hebrew increase letters.

The planner is intentionally stateful-but-append-only: every band
upgrade and every budget commitment is retained in history (the
`grow-only` rule). The only way to shrink a band is to pass
`force:true` for remediation — this leaves an audit trail.

---

## 2. Public API

Exported from `onyx-procurement/src/hr/comp-planner.js`:

| Export | Kind | Notes |
|---|---|---|
| `CompPlanner` | class | main entry point |
| `LABELS` | object | HE/EN label map |
| `IL_EMPLOYER` | object | Israeli statutory employer rates |
| `DEFAULT_MERIT_MATRIX` | object | 5×4 merit percentages |
| `IL_MARKET_SAMPLE` | object | sample IL benchmark data |
| `COMPRESSION_FLOOR` | number | 1.10 default |
| `PAY_EQUITY_FLAG_PCT` | number | 0.05 default |

### `CompPlanner` instance methods

| Method | Signature | Purpose |
|---|---|---|
| `defineBand` | `{grade, jobFamily, min, mid, max, currency, force?}` | Create / upgrade (grow-only) a salary band |
| `getBand` | `(grade, jobFamily)` | Lookup |
| `upsertEmployee` | `(emp)` | Merge-only employee registry |
| `positionInRange` | `(employeeId)` | Compa-ratio, penetration, quartile |
| `plannedIncrease` | `{budget, employees, method, colaPct?}` | Budget-scaled allocation |
| `meritMatrix` | `{performance, compaRatio}` | 2D lookup |
| `marketComparison` | `{role, level, location:'IL'}` | IL benchmark stub |
| `totalRewards` | `(employeeId)` | Base + bonus + equity + statutory |
| `equityPay` | `()` | Gender + minority pay-equity audit |
| `payCompression` | `()` | Detect manager-vs-report inversion |
| `hiringBands` | `()` | Min/max hire rates to avoid compression |
| `budgetTracker` | `{period, departmentId, planned?, actual?}` | Planned vs actual |
| `generateIncreaseLetter` | `(employeeId)` | Hebrew + English letter |

---

## 3. Band Structure (Default Grades)

Suggested grade ladder for Techno-Kol Uzi (2026, ILS monthly gross):

| Grade | Family | Min | Mid | Max | Notes |
|---|---|---|---|---|---|
| L1 | operations | 9,500 | 12,000 | 15,000 | Entry operations |
| L2 | operations | 13,000 | 17,000 | 22,000 | Junior operations |
| L3 | operations | 20,000 | 27,000 | 36,000 | Senior operations |
| L3 | engineering | 22,000 | 28,000 | 36,000 | Mid engineer |
| L4 | engineering | 32,000 | 42,000 | 55,000 | Senior engineer |
| L5 | engineering | 45,000 | 58,000 | 75,000 | Staff engineer |
| L6 | engineering | 60,000 | 78,000 | 100,000 | Principal engineer |
| M1 | engineering | 40,000 | 52,000 | 68,000 | Team lead |
| M2 | engineering | 55,000 | 72,000 | 95,000 | Engineering manager |
| C1 | construction | 7,000 | 9,500 | 12,000 | Laborer (פועל) |
| C2 | construction | 11,000 | 14,000 | 18,000 | Foreman (מנהל עבודה) |
| C3 | construction | 18,000 | 25,000 | 34,000 | Site engineer (מהנדס) |
| C4 | construction | 28,000 | 38,000 | 52,000 | Project manager |

Bands are seeded at deploy time via repeated `defineBand()` calls.
Future upgrades only grow the bounds — the grow-only rule ensures
we never silently devalue a band.

---

## 4. Merit Matrix (Performance × Compa-Ratio)

Rows = annual performance rating (1–5), columns = compa-ratio quartile.
Values are the **percent increase** granted at that cell.

| Perf | Q1 (<0.9) | Q2 (0.9–1.0) | Q3 (1.0–1.1) | Q4 (>1.1) |
|---|---|---|---|---|
| **5 — Exceptional** | **8.0%** | 6.0% | 4.5% | 3.0% |
| **4 — Exceeds** | 6.0% | 4.5% | 3.5% | 2.0% |
| **3 — Meets** | 4.0% | 3.0% | 2.0% | 1.0% |
| **2 — Below** | 2.0% | 1.0% | 0.5% | 0.0% |
| **1 — Unsatisfactory** | 0.0% | 0.0% | 0.0% | 0.0% |

**Design intent:** biggest increases flow to **high performers at low
compa-ratio** (top-left cell). This simultaneously corrects
underpayment and rewards merit, which is the standard two-axis
compensation-planning pattern.

Monotonicity is tested: pct never decreases as performance rises at a
fixed quartile, and pct never rises as compa quartile rises at a fixed
performance level.

---

## 5. Allocation Methods

`plannedIncrease({budget, employees, method})` supports:

1. **merit-matrix** (default) — uses performance × compa-ratio
   lookup. Proposed amounts are scaled down linearly if they exceed
   the budget; never exceed it. Never distributes more than `budget`.
2. **cola** — flat COLA percent applied to everyone; `colaPct`
   parameter (default 3%).
3. **market-adjust** — brings employees up to band midpoint (or
   market sample midpoint if no band). Capped at +15% per employee.

All three methods produce the same output shape
(`{method, budget, totalProposed, totalGranted, utilization,
scaleApplied, allocations[]}`), which makes the UI layer trivial.

---

## 6. Israeli Market Notes

**Embedded sample data** lives in `IL_MARKET_SAMPLE` and is clearly
labeled as demonstration-only. Each level carries a `source` tag so
readers know which survey/quarter it came from.

### Real-data hooks (production replacement)

The constructor accepts `{marketData}` to fully override the sample:

```js
const planner = new CompPlanner({ marketData: myLiveFeed });
```

Recommended Israeli sources:

| Source | URL | Notes |
|---|---|---|
| **CBS / הלמ״ס** | https://www.cbs.gov.il | Quarterly wage surveys, official |
| **Ethosia** | https://www.ethosia.co.il | Annual IL high-tech report |
| **AllJobs** | https://www.alljobs.co.il | Crowd-sourced salary ranges |
| **TheMarker** | https://www.themarker.com | Annual salary survey |
| **Michpal / Hilan / Malam Team** | — | Payroll-provider aggregates |

The embedded `IL_MARKET_SAMPLE` covers six role families:
`engineering`, `product`, `sales`, `operations`, `construction`,
`finance` across 3–5 levels each.

### Hebrew cultural notes

- **Construction** family is split into IL-specific roles: `פועל`
  (laborer), `מנהל עבודה` (foreman), `מהנדס אתר` (site engineer),
  `מנהל פרויקט` (PM) — matching how Israeli construction comp
  actually segments.
- Salary is always stated **gross monthly ILS** (the IL norm),
  NOT annual-base. The planner computes annual = monthly × 12
  internally only for total-rewards.

---

## 7. Total Rewards Breakdown

`totalRewards(employeeId)` returns all annual components:

| Component | Source | Rate |
|---|---|---|
| `baseAnnual` | `emp.baseSalary × 12` | — |
| `bonus` | `emp.bonus` (annual) | direct |
| `equity` | `emp.equity` (annual) | direct |
| `pension` (פנסיה) | statutory | 6.5% employer × 12 |
| `severance` (פיצויים) | statutory | 8.33% × 12 |
| `studyFund` (קרן השתלמות) | statutory | 7.5% × 12 |
| `bl` (ביטוח לאומי) | statutory | ~7.75% × 12 (blended) |
| `mealAllowance` (שובר/הבראה) | `emp.mealAllowance × 12` | direct |
| `carAllowance` (רכב) | `emp.carAllowance × 12` | direct |

All values are ILS. The `IL_EMPLOYER` constant is exported so other
modules (payroll, analytics) can re-use the same rates without
re-declaration — important because Israeli rates change annually.

---

## 8. Pay Equity (equityPay)

- Analyzes gender (female/male) and minority (minority/majority)
  pay gaps **within each band** (grade × jobFamily).
- Groups with **n < 3** are suppressed per privacy best-practice
  (matching the `MIN_EQUITY_GROUP = 3` pattern from `analytics.js`).
- Flags gaps above `PAY_EQUITY_FLAG_PCT = 5%`.
- Israeli compliance: `חוק שכר שווה לעובדת ולעובד` (Equal Pay
  Law, 1996) — this audit is what HR must run before annual review
  cycles.
- Output includes `message_he` + `message_en` for each flag.

---

## 9. Compression & Hiring Bands

**Compression** = a manager earning less than `COMPRESSION_FLOOR ×
highest_direct_report_salary`. Default floor = 1.10 (manager must
earn at least 10% above top report).

`payCompression()` returns:
```js
{
  floor: 1.10,
  issues: [{
    managerId, managerName, managerSalary,
    highestReportSalary, ratio, requiredFloor,
    remediationILS,     // how much the manager needs, in ILS
    message_he, message_en,
  }]
}
```

`hiringBands()` then uses the current employee registry to compute,
per band, the **recommended min/max hire rate** that would not break
compression for any existing manager in that band. If the band min
itself exceeds what the manager can afford, it emits a warning:
`"Compression unavoidable without upgrading manager comp first"`.

---

## 10. Budget Tracker

`budgetTracker({period, departmentId, planned, actual})`:

- Stores per-period, per-department planned vs actual comp spend.
- **Planned is grow-only**: once committed, it can only be
  increased — never silently lowered. History is retained.
- Returns `{planned, actual, variance, variancePct, status}` where
  status ∈ `{over-budget, under-budget, on-target}`.

---

## 11. Hebrew Increase Letter

`generateIncreaseLetter(employeeId)` produces a formal bilingual
letter. The employee must have `proposedIncrease = {pct, newSalary,
effectiveDate, reason}` set. Output includes:

```
{
  hebrew:   "...",  // 14-line HE version
  english:  "...",  // 14-line EN version
  bilingual:"... --- English --- ..."
}
```

Every letter reaffirms the core rule
**"לא מוחקים רק משדרגים ומגדלים"** and explicitly states that
statutory social benefits (pension / study fund / severance)
remain unchanged.

---

## 12. Hebrew Glossary (מילון)

| English | Hebrew | Notes |
|---|---|---|
| Salary band | טווח שכר | grade + family |
| Compa-ratio | יחס חציון | salary / midpoint |
| Band midpoint | חציון הטווח | target pay |
| Range penetration | חדירה לטווח | 0..1 position |
| Merit increase | העלאת הצטיינות | performance-based |
| COLA | התאמת יוקר מחיה | cost-of-living |
| Market adjustment | התאמה לשוק | catch-up |
| Total rewards | שכר כולל | all-in |
| Base salary | שכר בסיס | monthly gross |
| Bonus | בונוס | annual variable |
| Equity | הון עצמי / אופציות | RSU/options |
| Pension | פנסיה | 6.5% employer |
| Severance | פיצויים | 8.33% employer |
| Study fund | קרן השתלמות | 7.5% employer |
| National insurance | ביטוח לאומי | BL |
| Pay compression | דחיסת שכר | mgr < report |
| Pay equity | שוויון בשכר | equal-pay audit |
| Gender pay gap | פער שכר מגדרי | m/f |
| Performance rating | דירוג ביצועים | 1–5 scale |
| Grade | דרגה | band level |
| Job family | משפחת תפקידים | engineering/ops/… |
| Hire rate ceiling | תקרת גיוס | anti-compression |
| Merit matrix | מטריצת הצטיינות | 2D lookup |
| Budget | תקציב | period × dept |
| Planned vs actual | מתוכנן מול בפועל | variance |
| Laborer | פועל | construction |
| Foreman | מנהל עבודה | site lead |
| Site engineer | מהנדס אתר | construction |
| Project manager | מנהל פרויקט | construction |

---

## 13. Test Coverage

`test/hr/comp-planner.test.js` — **30 tests, all passing**:

**Band definition (4)**
- [PASS] defineBand creates a band keyed by grade|family
- [PASS] defineBand rejects bad inputs
- [PASS] defineBand follows grow-only rule
- [PASS] defineBand force=true allows downgrade for remediation

**Compa-ratio (4)**
- [PASS] compa-ratio = salary / midpoint
- [PASS] compa-ratio quartile boundaries
- [PASS] range penetration is clamped to 0..1
- [PASS] positionInRange flags belowMin / aboveMax

**Merit matrix (3)**
- [PASS] high performer at low compa gets biggest increase
- [PASS] merit matrix monotonic — higher perf ≥ lower perf at same quartile
- [PASS] merit matrix monotonic — lower compa ≥ higher compa at same perf

**Planned increase (4)**
- [PASS] merit-matrix method respects budget ceiling
- [PASS] merit-matrix method does not exceed proposed when budget is generous
- [PASS] cola method applies flat percent
- [PASS] market-adjust increases only those below market mid

**Market comparison (3)**
- [PASS] marketComparison returns IL benchmark sample
- [PASS] marketComparison handles unknown role gracefully
- [PASS] marketComparison non-IL location returns note

**Total rewards (1)**
- [PASS] totalRewards sums base + bonus + equity + statutory + benefits

**Pay equity (2)**
- [PASS] equityPay flags gender gap above threshold
- [PASS] equityPay suppresses tiny groups

**Compression & hiring (4)**
- [PASS] payCompression detects manager below top report
- [PASS] no compression when manager earns floor * top
- [PASS] hiringBands recommends min at least band.min
- [PASS] hiringBands warns when manager too compressed

**Budget tracker (3)**
- [PASS] budgetTracker computes variance
- [PASS] budgetTracker planned is grow-only
- [PASS] budgetTracker flags over-budget

**Increase letter (2)**
- [PASS] generateIncreaseLetter produces Hebrew + English bilingual output
- [PASS] generateIncreaseLetter rejects missing proposedIncrease

Run command:
```
node onyx-procurement/test/hr/comp-planner.test.js
```

---

## 14. Rule Enforcement Summary

| Mechanism | How |
|---|---|
| Band grow-only | `defineBand` merges min/mid/max upward; past state kept in `history` |
| Employee merge-only | `upsertEmployee` spreads previous record, never deletes fields |
| Budget grow-only | `budgetTracker` planned never shrinks; both planned and actual writes pushed to `history` |
| Compensation is never cut | Letters always describe **increases**; the module has no `generateDecreaseLetter` path |
| Privacy floor | Pay-equity groups suppressed below n=3 |
| Compression remediation | Remediation amounts are emitted as upgrades to the manager, never reductions to reports |

---

## 15. Integration Notes

- Import via `const {CompPlanner} = require('./src/hr/comp-planner');`
- Pair with existing `analytics.js` in the same folder — both share
  the same Israeli labor constants conceptually; future refactor
  can extract them to `src/hr/il-constants.js` without breaking
  callers.
- Frontend: the `allocations[]` array from `plannedIncrease` maps
  one-to-one onto a UI table.
- Payroll bridge: `totalRewards()` + `generateIncreaseLetter()` can
  be wired to the payroll module to push new salaries into the next
  pay run once approved.

---

## 16. Never-Delete Commitment

This report itself falls under the rule. It is appended to the
`_qa-reports/` directory and is never to be deleted or overwritten.
Subsequent audits should add **new** files (e.g., `AG-Y071b-...`)
or append additional sections, but must preserve this record in
its entirety.

**— End of Report AG-Y071 —**
