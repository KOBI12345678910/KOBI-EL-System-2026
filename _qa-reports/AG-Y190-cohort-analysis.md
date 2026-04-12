# AG-Y190 — Customer Cohort Analysis (`CohortAnalysis`)

**Agent**: Y-190
**Module**: `onyx-procurement/src/reporting/cohort-analysis.js`
**Tests**: `onyx-procurement/test/reporting/cohort-analysis.test.js`
**Date**: 2026-04-11
**House rule**: לא מוחקים רק משדרגים ומגדלים — Never delete, always upgrade and grow.
**Complements**:
- Y-100 churn prevention (`onyx-procurement/src/customer/churn-prevention.js`)
- X-06 churn predictor (`onyx-procurement/src/analytics/churn-predictor.js`)

---

## 1. Scope · היקף

**EN** — `CohortAnalysis` is the reporting-layer engine that turns a flat
`customers + orders` feed into a classic acquisition-cohort analysis:
retention curves, revenue curves, order-count curves, heatmap data, cumulative
vs period retention, and average revenue per cohort. The output is shaped for
the BI dashboard's heatmap widget (rows = acquisition cohort, columns = months
since acquisition) and carries bilingual (Hebrew / English) headers so the UI
can render RTL or LTR without re-keying.

**HE** — `CohortAnalysis` הוא מנוע הדיווח שהופך רשימה שטוחה של לקוחות והזמנות
לניתוח קוהורט קלאסי: עקומות שימור, עקומות הכנסה, עקומות הזמנות, מפת חום,
שימור מצטבר מול שימור לתקופה, וממוצע הכנסות לקוהורט. הפלט מעוצב לווידג׳ט מפת
החום בדשבורד ה-BI (שורות = קוהורט רכישה, עמודות = חודשים מאז רכישה) ונושא
כותרות דו-לשוניות כך שהממשק יכול להציג RTL או LTR ללא פענוח חוזר.

The module is a pure-JavaScript, zero-dependency reporting engine — no
`require()` of third-party packages, no network calls, no randomness, no
timezone surprises. Identical inputs always produce the identical heatmap, so
tests are reproducible and audits are a diff.

## 2. API surface

```text
new CohortAnalysis({ now?, maxMonths? })

// primary entry point — returns the full frozen payload
buildCohort(customers, { metric, maxMonths?, hebrewLabels? })

// helpers
monthlyBuckets(customers)              -> { byKey, keys }
heatmap(customers, opts)               -> frozen heatmap slice
avgRevenuePerCohort(customers)         -> frozen list
retentionCurve(customers, cohortKey)   -> { period_pct, cumulative_pct }
revenueCurve(customers, cohortKey)     -> { revenue_by_month_ils, total }
```

Every return value from the class is **deep-frozen** — the UI cannot
accidentally mutate the ledger and the same instance can be reused across
builds without leaking state between calls.

### Metrics · מדדים

| metric      | what it emits in the heatmap `cells`                   | HE                 |
| ----------- | ------------------------------------------------------ | ------------------ |
| `retention` | `%` of the cohort that placed ≥1 order in that period  | שימור (%)          |
| `revenue`   | total revenue (ILS) booked by the cohort that period   | הכנסות (₪)         |
| `orders`    | count of orders the cohort placed that period          | הזמנות             |

The payload shape is identical across metrics so the same renderer can draw
all three without branching — only the `cells` array changes.

## 3. Input contract · חוזה קלט

```js
[
  {
    id: 'c1',                              // required, stable
    acquiredAt: '2026-01-05',              // optional — falls back to earliest order
    orders: [
      { id: 'o1', date: '2026-01-15', revenue: 1000 },
      { id: 'o2', date: '2026-02-01', revenue:  500 },
    ],
  },
  ...
]
```

- `id` is required and must be non-empty.
- `acquiredAt` is optional **if** the customer has at least one order — in
  that case the engine picks the earliest order date. This is the standard
  "first-touch" convention used by every cohort tool.
- `revenue` defaults to `0` when missing and must be a finite number when
  present.
- Orders placed **before** `acquiredAt` are silently ignored (defensive —
  real feeds sometimes have retroactive backfills).

Validation errors are thrown with specific `customers[i].orders[j].field`
paths so the upstream ETL can fix the bad record without guessing.

## 4. Output shape · מבנה הפלט

`buildCohort(...)` returns a single frozen object with five top-level keys:

```text
{
  metric:        'retention' | 'revenue' | 'orders',
  generated_at:  ISO timestamp (from opts.now for deterministic tests),
  headers:       HEADERS constant (bilingual he/en for every axis),
  columns: [
    {
      month_index: 0,
      key:         '2026-01',
      label_gregorian: { he: 'ינואר 2026', en: 'January 2026' },
      label_hebrew_month: { he: 'ינואר', en: 'January' },  // null if disabled
    },
    …
  ],
  heatmap: {
    metric, header_metric, header_rows, header_cols,
    rows_total, cols_total,
    rows: [ { cohort, label, size, cells: [...] }, … ],
    cells_flat: [ { row, col, cohort, month_index, value }, … ],
  },
  cohorts: [
    {
      cohort: '2026-01',
      label:  { he: 'ינואר 2026', en: 'January 2026' },
      size:   2,
      period_retention_pct:     [100, 50, 50, 50, 0, 0],
      cumulative_retention_pct: [100, 100, 100, 100, 100, 100],
      revenue_by_month_ils:     [3000, 500, 800, 300, 0, 0],
      orders_by_month:          [2, 1, 1, 1, 0, 0],
      total_revenue_ils:        4600,
      avg_revenue_per_customer_ils: 2300,
    },
    …
  ],
  summary: {
    cohorts_count, total_customers,
    total_revenue_ils,
    avg_revenue_per_cohort_ils,
    avg_revenue_per_customer_ils,
  },
}
```

### Why both `rows` and `cells_flat`?
Most dashboard heatmap components accept either format. `rows` is compact and
streams nicely to a table; `cells_flat` drops straight into d3/echarts/plotly
as `{row, col, value}` triplets without any reshaping on the client.

## 5. Period vs cumulative retention · שימור לתקופה מול מצטבר

This is the tripwire that catches the most cohort engines in the wild. We
compute both, with a test that asserts **cumulative ≥ period at every
cell**.

- **Period retention** — the % of the cohort that placed ≥1 order **in that
  specific month**. A customer who skipped a month shows up as inactive in
  that column. This is what most people mean colloquially by "retention".
- **Cumulative retention** — the % of the cohort that has placed ≥1 order
  **at any point ≤ that month**. Once a customer has ordered, they count
  forever. This is the right metric for LTV modelling and for answering
  "did we ever win them back?".

Both curves live on every cohort row; the UI picks whichever it needs.

### Worked example (from the unit tests)

Cohort **2026-01** — 2 customers, 6 month window:

| m0  | m1 | m2 | m3 | m4 | m5 |
| --- | -- | -- | -- | -- | -- |
| 100 | 50 | 50 | 50 |  0 |  0 | ← period_retention_pct
| 100 |100 |100 |100 |100 |100 | ← cumulative_retention_pct

Both customers placed a first-month order → 100/100. After that only one
customer ordered in any given month (rotating between c1 and c2), so period
drops to 50% while cumulative stays at 100% because neither has churned yet.

## 6. Israeli month boundaries · גבולות חודש ישראליים

Business reporting in Israel runs on the Gregorian calendar. The engine uses
**UTC `YYYY-MM` keys** for bucket sort order, and optionally attaches the
Hebrew **month name** (ינואר…דצמבר) as a separate display field so the UI can
render RTL labels without re-parsing.

- Bucket key: `YYYY-MM` (UTC). Example: `2026-01`.
- Gregorian bilingual label: `{ he: 'ינואר 2026', en: 'January 2026' }`.
- Hebrew-only month name: `{ he: 'ינואר', en: 'January' }` — useful for
  short-form axis ticks.
- Pass `{ hebrewLabels: false }` to suppress the Hebrew-only field (still
  emits the bilingual Gregorian label).

We **never** mix Hebrew-calendar boundaries and Gregorian keys on the same
axis — that would cause off-by-one errors around Rosh Chodesh. Hebrew months
are a display-only concern for cohort analysis.

## 7. Never-delete guarantees · התחייבות ״לא מוחקים״

- `CohortAnalysis` instances are **frozen** at construction — no hidden
  mutable state can be swapped in.
- `buildCohort(...)` **never mutates its input** — we normalise into fresh
  objects, sort into new arrays, and return a deep-frozen payload.
- Multiple `buildCohort` calls are independent — the second call cannot
  corrupt the first call's payload. A dedicated test pins this.
- No method name matches `^delete|^remove|^drop|^clear` — the class simply
  has no deletion entry point, and a test enforces that at runtime so a
  future refactor cannot accidentally introduce one.
- The engine is deterministic: given the same `{now, customers, opts}`, it
  returns byte-identical output. Reports are reproducible, audits are a
  diff.

## 8. Hebrew glossary · מילון עברי

| Term             | Hebrew            | English                   |
| ---------------- | ----------------- | ------------------------- |
| cohort           | קוהורט            | Cohort                    |
| acquisition      | רכישת לקוח        | Acquisition               |
| retention        | שימור             | Retention                 |
| revenue          | הכנסות            | Revenue                   |
| orders           | הזמנות            | Orders                    |
| period           | תקופה             | Period                    |
| cumulative       | מצטבר             | Cumulative                |
| heatmap          | מפת חום           | Heatmap                   |
| months since acq | חודשים מאז רכישה  | Months Since Acquisition  |

Exposed as the frozen `GLOSSARY` constant — the UI binds to the same strings
the back end uses, so there is no drift between the API and the labels users
see.

## 9. Test summary · סיכום בדיקות

`node --test test/reporting/cohort-analysis.test.js` —
**31 tests, all passing** (~124 ms).

Coverage areas:

- **Constants & primitives** — `COHORT_METRICS`, `HEBREW_MONTHS`,
  `ENGLISH_MONTHS`, `HEADERS`, `GLOSSARY` are all frozen and bilingual;
  `monthKey`, `monthsBetween`, `monthRange`, `labelForMonthKey` helpers
  agree on UTC math and bilingual output.
- **Bucketing** — groups by acquisition month; infers `acquiredAt` from the
  earliest order when omitted; rejects missing `id`, missing
  `acquiredAt`+orders, and non-array input.
- **Retention metric** — hand-checked period + cumulative curves on a
  2-cohort, 4-customer fixture; `cumulative ≥ period` invariant test.
- **Revenue metric** — cohort totals, per-month revenue, summary
  aggregates, avg revenue per cohort and per customer.
- **Orders metric** — order counts per month, heatmap cells match.
- **Heatmap shape** — rows × cols match cohorts × months; `cells_flat`
  triplets; bilingual headers on every axis.
- **Columns payload** — Gregorian bilingual labels, optional
  Hebrew-only month name, `hebrewLabels: false` override.
- **Curve helpers** — `retentionCurve` and `revenueCurve` return scoped
  slices; unknown-cohort guard throws `RangeError`.
- **`avgRevenuePerCohort`** — one entry per cohort with correct math.
- **Validation & guardrails** — unknown metric throws, empty input returns
  a well-formed zeroed payload, invalid `now` throws.
- **Freezing & immutability** — output is deep-frozen, mutation attempts
  throw; input customers array is not mutated; instance is frozen.
- **`maxMonths` cap** — per-call override caps the column count.
- **Pre-acquisition orders** — silently ignored, not counted in totals.
- **Never-delete compliance** — no mutator method name on the prototype,
  second build does not corrupt first build.

## 10. Integration hooks · נקודות שילוב

The engine has no dependencies — you wire it into the dashboard by importing
it and calling `buildCohort`. Intended wiring:

```js
const { CohortAnalysis } = require('../reporting/cohort-analysis');

// Nightly BI job
async function refreshCohortTile(db, now) {
  const customers = await db.query(`
    SELECT c.id, c.created_at AS acquiredAt,
           json_agg(json_build_object(
             'id', o.id, 'date', o.placed_at, 'revenue', o.total_ils
           )) AS orders
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
  `);
  const engine = new CohortAnalysis({ now, maxMonths: 24 });
  const retention = engine.buildCohort(customers, { metric: 'retention' });
  const revenue   = engine.buildCohort(customers, { metric: 'revenue' });
  await db.tx(async (t) => {
    // Cache snapshots in the BI table — never overwrite old snapshots,
    // always insert a new row so we can diff month over month.
    await t.insert('bi_cohort_snapshots', {
      generated_at: retention.generated_at,
      metric: 'retention',
      payload: retention,
    });
    await t.insert('bi_cohort_snapshots', {
      generated_at: revenue.generated_at,
      metric: 'revenue',
      payload: revenue,
    });
  });
}
```

No code in Y-190 imports Y-100 / X-06 directly — the bridge is the caller's
job so the three modules can be tested in isolation and released
independently.

## 11. Compliance checklist · רשימת תאימות

- [x] Never deletes — no mutator method, instance frozen, output deep-frozen.
- [x] Inputs untouched — `buildCohort` normalises into fresh objects, does
      not mutate the caller's array.
- [x] Deterministic — same `{now, customers, opts}` → same payload byte-for-byte.
- [x] Zero third-party dependencies — `require()` is used only to expose the
      module. No network, no FS, no randomness.
- [x] Bilingual headers on every axis, bilingual glossary exported as
      `GLOSSARY`, Hebrew month names exported as `HEBREW_MONTHS`.
- [x] Gregorian business-month boundaries (UTC `YYYY-MM`) — no Hebrew-calendar
      off-by-one.
- [x] 31 unit tests covering every public method and every guardrail.

## 12. Files · קבצים

- `onyx-procurement/src/reporting/cohort-analysis.js` — main module (zero deps, ~450 LOC).
- `onyx-procurement/test/reporting/cohort-analysis.test.js` — 31 unit tests.
- `_qa-reports/AG-Y190-cohort-analysis.md` — this bilingual QA report.

— end of AG-Y190 — סוף הדוח —
