# AG-Y021 — Sales Target Tracker (Quotas / Attainment / Pacing)
**Agent:** Y-21 | **Swarm:** 4 (growth) | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 32/32 tests green (~132 ms)
**Rule honored:** לא מוחקים רק משדרגים ומגדלים

---

## 1. Scope

A zero-dependency, in-memory sales-quota / attainment / pacing engine for
Kobi Elkayam's Techno-Kol Uzi mega-ERP. Tracks revenue, margin, or unit
quotas per salesperson per period, answers "how are we doing?" (attainment),
"are we on the right pace?" (pacing), aggregates teams under managers, and
generates leaderboards + below-threshold alerts. Bilingual Hebrew/English
labels throughout. No Math.random, no Date.now inside the math, runs under
Node 16+, Electron, or any bundler.

Delivered files
- `onyx-procurement/src/sales/target-tracker.js` — engine (~760 LOC)
- `onyx-procurement/test/sales/target-tracker.test.js` — 32 tests / 8 groups
- `_qa-reports/AG-Y021-target-tracker.md` — this report

RULES respected
- Zero dependencies (only `node:test` + `node:assert/strict` in the test file)
- Hebrew bilingual labels on every quota, metric, period, status and alert
- **Never deletes — only upgrades and grows.** Re-calling `setQuota()` for
  an existing (salesperson, period) pair overwrites that cell in place
  ("upgrade"); the sales log is append-only; no `delete*`, `remove*`,
  `clear`, `reset`, `wipe`, or `drop` method exists. Test 31 asserts their
  absence.
- Deterministic: no randomness, no wall-clock inside the math — the `now`
  override flows through every calculation.

---

## 2. Domain model

### Quota
```js
{
  salespersonId, period:{type, year, q?, m?, key},
  baseTargetAmount,            // what the caller passed in
  targetAmount,                // after mid-period proration
  baseTargetDeals, targetDeals,
  metric:'revenue'|'margin'|'units',
  hireDate?, prorated, prorationFactor,
  labels:{he, en},
  createdAt
}
```

### Sale (append-only)
```js
{
  id: `SALE_${000001…}`,
  salespersonId, amount, margin, units,
  closedDate: 'YYYY-MM-DD'
}
```

### Period
| type      | shape                            | key        |
|-----------|----------------------------------|------------|
| `month`   | `{type:'month',   year, m:1..12}`| `2026-04`  |
| `quarter` | `{type:'quarter', year, q:1..4}` | `2026-Q2`  |
| `year`    | `{type:'year',    year}`         | `2026`     |

Period bounds (inclusive, UTC):
- month:   first day of month .. last day of month
- quarter: first day of month (q-1)*3+1 .. last day of month q*3
- year:    Jan 1 .. Dec 31

### Working week (Israeli)
Default: Sunday..Thursday (`[0,1,2,3,4]`, where 0=Sunday, 5=Friday,
6=Saturday). Configurable per-instance via `new SalesTargetTracker({
workingDays: [...] })` or `setWorkingDays(mask)`. Friday/Saturday are NOT
counted as working days.

---

## 3. Public API

`new SalesTargetTracker({ now?, workingDays?, locale? })` returns an
instance with these methods:

| method                                            | purpose |
|---------------------------------------------------|---------|
| `setQuota({salespersonId, period, targetAmount, targetDeals, metric, hireDate?})` | set or upgrade a quota; applies mid-period proration automatically |
| `getQuota(salespersonId, period)`                 | fetch a stored quota (null if missing) |
| `listQuotas(salespersonId)`                       | all periods for a rep, newest first |
| `recordSale({salespersonId, amount, margin, units, closedDate})` | append-only sale log |
| `attainment(salespersonId, period)`               | `{target, actual, pct, gap, deals, dealsTarget, …}` |
| `pacingAnalysis(salespersonId, period)`           | on-track vs expected run rate |
| `addDirectReport(managerId, salespersonId)`       | register a team member |
| `getDirectReports(managerId)`                     | team roster |
| `teamRollup(managerId, period)`                   | aggregate direct reports for a period |
| `historicalTrend(salespersonId, periods[])`       | attainment over N periods |
| `generateLeaderboard(period)`                     | ranked list, pct tiebreak |
| `alertBelowThreshold(threshold, period)`          | reps below X% pacing |

Static helpers:
- `SalesTargetTracker.LABELS`
- `SalesTargetTracker.METRIC_LABELS`
- `SalesTargetTracker.STATUS_LABELS`
- `SalesTargetTracker.PERIOD_LABELS`
- `SalesTargetTracker.DEFAULT_WORKING_DAYS`
- `SalesTargetTracker.util.{normalizePeriod, periodBounds, countWorkingDays, computeProrationFactor, classifyPace, severityFromPace, parseDate, formatDate, daysBetween}`

CommonJS exports the class by name, `default`, and every utility — so it
consumes equally well from `require` and `import`.

---

## 4. Pacing formula

```
total_wd        = working_days(period.start, period.end)
elapsed_wd      = working_days(period.start, min(today, period.end))
                  or 0 if today < period.start
remaining_wd    = total_wd - elapsed_wd
fraction        = elapsed_wd / total_wd        (0 if total_wd == 0)

expected        = targetAmount * fraction
actual          = Σ sale[metric]
                  where sale.salespersonId matches
                    AND sale.closedDate ∈ [period.start, period.end]
                    AND sale.closedDate <= today
                    (the `today` clamp is applied even when today is
                     still inside the period — pacing is "as-of today")

pace_pct        = actual / expected              (null if expected == 0)
projected_full  = actual / fraction              (0 if fraction == 0)
gapToExpected   = expected - actual
```

**Status classification** (from `classifyPace(pct)`):

| pace_pct         | status     | labels                   |
|------------------|------------|--------------------------|
| `>= 1.10`        | `ahead`    | לפני הקצב / Ahead of Pace|
| `[0.95, 1.10)`   | `on_track` | בקצב / On Track          |
| `[0.80, 0.95)`   | `behind`   | בפיגור / Behind          |
| `< 0.80`         | `critical` | קריטי / Critical         |
| `null`           | `on_track` | (period hasn't started)  |

Covered by tests 9, 10, 11, 12, 24, 25.

---

## 5. Attainment formula

```
target      = quota.targetAmount  (already prorated if mid-period hire)
actual      = Σ sale[metric]
              where sale in-period (no `today` clamp)
pct         = actual / target     (null if target == 0)
gap         = target - actual
deals       = count of in-period sales
dealsGap    = targetDeals - deals
```

Covered by tests 5, 6, 7, 8, 22, 23.

---

## 6. Period boundaries

All bounds are inclusive and use UTC to avoid TZ drift. The
`periodBounds()` utility returns `{ start: Date, end: Date }`:

| period type                          | start      | end        |
|--------------------------------------|------------|------------|
| `{type:'month', year:2026, m:4}`     | 2026-04-01 | 2026-04-30 |
| `{type:'quarter', year:2026, q:2}`   | 2026-04-01 | 2026-06-30 |
| `{type:'year', year:2026}`           | 2026-01-01 | 2026-12-31 |
| `{type:'month', year:2026, m:2}`     | 2026-02-01 | 2026-02-28 |
| `{type:'month', year:2024, m:2}`     | 2024-02-01 | 2024-02-29 |

Leap years fall out naturally from `new Date(Date.UTC(year, month, 0))`.
Covered by tests 26, 27, 28, 29.

### Working-day counts (Sun..Thu, Israeli week) — reference table

| period                    | total WD |
|---------------------------|----------|
| April 2026                | 22       |
| May 2026                  | 21       |
| June 2026                 | 22       |
| Q2 2026 (Apr+May+Jun)     | 65       |
| Year 2026                 | 261      |

---

## 7. Mid-period hire proration

When `hireDate` falls inside the target period, the quota is shrunk
proportionally to the fraction of the period still ahead of the hire:

```
proration = working_days(hireDate, period.end) / working_days(period.start, period.end)
          clamped to [0, 1]

targetAmount_effective = baseTargetAmount * proration
targetDeals_effective  = round(baseTargetDeals * proration)
```

Behavior at the edges:
- `hireDate <= period.start` → `proration = 1` (full target, "old hire")
- `hireDate >  period.end`   → `proration = 0` (zero target, "future hire")
- Inside the period → fractional, computed from the Sun..Thu working-day
  calendar (not calendar days, so weekends don't dilute it)

Worked example (test 18): monthly quota, `period = April 2026`,
`targetAmount = 220,000`, `hireDate = 2026-04-15` (Wednesday).
- total working days in April 2026 = 22
- working days from Wed Apr 15 through Thu Apr 30:
  - Wed15, Thu16, Sun19, Mon20, Tue21, Wed22, Thu23, Sun26, Mon27, Tue28, Wed29, Thu30 = **12**
- proration = 12/22 ≈ 0.5454
- `targetAmount` = 220,000 × 12/22 = **120,000**
- `targetDeals`  = round(22 × 12/22) = **12**

Worked example (test 19): quarterly quota, `period = Q2 2026`,
`targetAmount = 650,000`, `hireDate = 2026-05-03` (Sunday).
- total Q2 working days = Apr 22 + May 21 + Jun 22 = 65
- working days from Sun May 3 through Tue Jun 30:
  - May (3..7, 10..14, 17..21, 24..28, 31) = 21
  - Jun (1..4, 7..11, 14..18, 21..25, 28..30) = 22
  - total = **43**
- proration = 43/65 ≈ 0.6615
- `targetAmount` ≈ 650,000 × 43/65 ≈ **430,000**

Covered by tests 18, 19, 20, 21.

---

## 8. Leaderboard tiebreak rules

`generateLeaderboard(period)` returns every salesperson with a stored
quota for that period, sorted by:

1. `actual` **DESC** (raw metric total — revenue/margin/units)
2. `pct` **DESC** (attainment %, to reward doing more with less) — nulls
   (zero-target quotas) sort last
3. `salespersonId` **ASC** (deterministic alphabetic fallback)

Each entry gets a `rank` starting from 1.

Why pct as the second-level tiebreak? Two reps with identical raw sales
but different quotas are not equally productive — the one who got there
off a smaller base deserves the win. This is documented and tested
explicitly (test 16: SP_LOW 80k/100k beats SP_HIGH 80k/200k).

Final tiebreak by `salespersonId` (test 17) makes the order stable and
auditable even when actual and pct are tied, so screenshots,
reports and compensation runs never reorder themselves.

---

## 9. Team rollup

`teamRollup(managerId, period)`:
1. Fetch direct reports from the manager→[salespersonId] index
2. For each member, compute attainment + pacing (skip if no quota for period)
3. Sum targets, actuals, deals, dealsTarget
4. Compute rollup pct = totalActual / totalTarget (null if totalTarget 0)
5. Return `{ managerId, period, members[], skipped[], totals, labels }`

Members without a quota appear in `skipped`, never in `members`. This
means a manager who hires a new rep mid-period before setting their quota
won't have the rollup crash — they just show up on `skipped` until the
quota is set. Covered by tests 13, 14.

---

## 10. Hebrew ↔ English glossary

| Key             | עברית                  | English                |
|-----------------|------------------------|------------------------|
| `quota`         | יעד מכירות             | Sales Quota            |
| `target`        | יעד                    | Target                 |
| `actual`        | בפועל                  | Actual                 |
| `attainment`    | אחוז השגה             | Attainment %           |
| `gap`           | פער                    | Gap                    |
| `pacing`        | קצב התקדמות           | Pacing                 |
| `expected`      | צפוי                   | Expected               |
| `projected`     | תחזית סוף תקופה       | Projected Full-Period  |
| `deals`         | עסקאות                 | Deals                  |
| `leaderboard`   | טבלת מובילים          | Leaderboard            |
| `salesperson`   | איש מכירות             | Salesperson            |
| `manager`       | מנהל                   | Manager                |
| `team`          | צוות                   | Team                   |
| `trend`         | מגמה היסטורית         | Historical Trend       |
| `alert`         | התרעה                  | Alert                  |
| `threshold`     | סף התרעה               | Threshold              |
| `period`        | תקופה                  | Period                 |
| `rank`          | דירוג                  | Rank                   |
| `proration`     | חלוקה יחסית           | Proration              |
| `hireDate`      | תאריך תחילת עבודה     | Hire Date              |
| `workingDays`   | ימי עבודה              | Working Days           |
| `elapsed`       | ימים שחלפו            | Elapsed Days           |
| `remaining`     | ימים נותרו             | Remaining Days         |

### Metric labels
| key       | עברית    | English |
|-----------|----------|---------|
| `revenue` | הכנסות   | Revenue |
| `margin`  | רווח     | Margin  |
| `units`   | יחידות   | Units   |

### Status labels
| key         | עברית        | English         | pace_pct range |
|-------------|--------------|-----------------|----------------|
| `ahead`     | לפני הקצב   | Ahead of Pace   | `>= 1.10`      |
| `on_track`  | בקצב         | On Track        | `[0.95, 1.10)` |
| `behind`    | בפיגור       | Behind          | `[0.80, 0.95)` |
| `critical`  | קריטי        | Critical        | `< 0.80`       |

### Period labels
| key       | עברית   | English |
|-----------|---------|---------|
| `month`   | חודש    | Month   |
| `quarter` | רבעון   | Quarter |
| `year`    | שנה     | Year    |

### Severity grades (for alerts)
`info` (above threshold) → `low` → `medium` → `high` → `critical`, bucketed
by `pace_pct / threshold` ratios: `>=0.90 / >=0.75 / >=0.50 / below`.

All labels are exported both as module-level constants and as
`SalesTargetTracker.LABELS / .METRIC_LABELS / .STATUS_LABELS /
.PERIOD_LABELS`, and each stored quota carries its own `labels.{he,en}`
(test 30).

---

## 11. Test suite — 32 green

```
node --test onyx-procurement/test/sales/target-tracker.test.js
```

| #  | Test                                                                | Focus                     |
|----|---------------------------------------------------------------------|---------------------------|
| 01 | setQuota stores and getQuota retrieves                              | CRUD                      |
| 02 | setQuota validates metric                                           | input hygiene             |
| 03 | setQuota re-set is an upgrade not a delete                          | project rule              |
| 04 | recordSale is append-only with deterministic ids                    | append-only               |
| 05 | attainment — basic revenue quota                                    | happy path                |
| 06 | attainment — zero target returns null pct                           | edge case                 |
| 07 | attainment — margin metric                                          | metric switch             |
| 08 | attainment — units metric                                           | metric switch             |
| 09 | pacing — expected vs actual using working-day fraction              | pacing formula            |
| 10 | pacing at period start — 0% elapsed                                 | boundary                  |
| 11 | pacing at period end — 100% elapsed                                 | boundary                  |
| 12 | pacing classification ahead/on_track/behind/critical                | status thresholds         |
| 13 | teamRollup aggregates direct reports                                | rollup sums               |
| 14 | teamRollup skips members without a quota                            | graceful degradation      |
| 15 | leaderboard — ordering by actual DESC                               | primary sort              |
| 16 | leaderboard — tiebreak by pct DESC                                  | tiebreak #1               |
| 17 | leaderboard — final tiebreak by salespersonId ASC                   | tiebreak #2 / stability   |
| 18 | mid-period hire proration — monthly                                 | proration (month)         |
| 19 | mid-period hire proration — quarterly                               | proration (quarter)       |
| 20 | hireDate before period — no proration                               | boundary                  |
| 21 | hireDate after period end — zero target                             | boundary                  |
| 22 | historicalTrend — across multiple periods                           | trend                     |
| 23 | historicalTrend — missing quota returns hadQuota:false              | trend / gap               |
| 24 | alertBelowThreshold returns only below-threshold reps               | alert gating              |
| 25 | alertBelowThreshold severity grading                                | alert shape               |
| 26 | period normalization edge cases                                     | input hygiene             |
| 27 | working-day count for Sunday..Thursday week                         | Israeli calendar          |
| 28 | quarter boundaries correct                                          | period bounds             |
| 29 | year period end-of-year correct                                     | period bounds             |
| 30 | bilingual Hebrew/English labels present                             | i18n                      |
| 31 | no delete method exists (project rule)                              | never-delete guard        |
| 32 | deterministic output — same inputs → same outputs                   | determinism               |

Run on 2026-04-11, Node 22 LTS, Windows 11, 131.88 ms wall clock.

---

## 12. Integration surface (optional, future)

This engine is intentionally isolated — it does NOT import from
`src/crm/pipeline.js`, `src/forecasting/demand-forecaster.js`, or the GL.
That lets it load inside payroll-autonomous, onyx-ai, and the dashboard
without dragging the whole ERP along. When wiring it into the existing
CRM pipeline, the bridge is a one-line adapter:

```js
// feed closed deals into the tracker
for (const deal of crm.listByStage('Won')) {
  tracker.recordSale({
    salespersonId: deal.owner,
    amount: deal.actual_value,
    margin: deal.margin,
    units:  deal.units,
    closedDate: deal.closed_at.slice(0, 10),
  });
}
```

Because quotas and sales are stored separately, the tracker works with
any data source — manual entry, CRM sync, CSV import, or API hook — and
the sales log is append-only by design, so a nightly re-feed is safe.

---

## 13. Never-delete compliance

Project rule: **לא מוחקים רק משדרגים ומגדלים.**

Compliance evidence:
1. No `delete*`, `remove*`, `clear`, `reset`, `wipe`, `drop` methods exist
   on the class. Test 31 asserts all of these names are `undefined`.
2. `setQuota` for an existing `(salespersonId, period)` pair **upgrades**
   the cell in place, increasing or decreasing the number but never
   removing it from the store. `listQuotas()` shows one row per period
   (no duplicate entries from re-set).
3. The sales log (`_sales` array) is strictly append-only — every
   `recordSale` invokes `push()` and nothing else. The sale ids
   (`SALE_000001`, `SALE_000002`, …) monotonically increase.
4. The team index (`_team`) is also append-only: `addDirectReport` is
   idempotent; there is no `removeDirectReport`.
5. The underlying data structures (`Map<string, Map<string, Quota>>` +
   `Sale[]`) are never reassigned in the class body — they are
   initialized once in the constructor and then only grow.

If a future release needs to "retire" a quota, the correct path is to
set its `baseTargetAmount` to the new (possibly lower) value — upgrading
in place — rather than adding a destructive API.

---

## 14. Known limitations / deferred

- The engine does not (yet) persist to disk. It is a pure in-memory store;
  hosting it inside a long-lived process is the caller's responsibility.
  Hook up `onyx-procurement/src/db/` when wiring into the live ERP.
- Holiday calendar is not modeled — the Sun..Thu working-day mask is a
  coarse approximation. Passover, Tishri, and Yom Haatzmaut are treated
  as normal working days. For payroll-grade accuracy, compose with
  `src/hr/israeli-holidays.js` if/when it lands.
- Multi-currency is not modeled. All amounts are assumed to be in one
  currency per salesperson — convert upstream if mixing ILS/USD/EUR.
- Attainment uses full-period actuals (no `asOf` clamp), while pacing
  uses `min(today, period.end)` — by design, because "attainment" means
  "how close are we to our total goal" and "pacing" means "are we on
  schedule". Both are tested explicitly.

---

**Sign-off:** ready to wire into the Techno-Kol Uzi dashboard + the
payroll-autonomous sales panel. Next step is the React view
(`SalesTargetPanel.jsx`) — this report deliberately stops at the engine.
