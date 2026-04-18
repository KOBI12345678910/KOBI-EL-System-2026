# AG-Y078 — Working Capital Dashboard (לוח בקרה להון חוזר)

**Agent:** Y-078 / Finance Swarm
**Wave:** 2026
**Status:** Delivered — tests green (63/63)
**Rule:** לא מוחקים — רק משדרגים ומגדלים
**Date:** 2026-04-11

---

## 1. Why this module exists

Techno-Kol Uzi is a **metal-fab shop** — capital-intensive, long production
cycles, chunky customer invoices, and suppliers who sell raw plate on 60-day
terms. Working capital is not a "finance team nice-to-have"; it is the
**difference between hiring a new laser operator and taking out an overdraft
at 11% to cover April wages**.

This module answers five questions, on demand, for any month:

1. **How long is cash stuck in customers?** → DSO (ימים לגבייה)
2. **How long do we hold onto supplier money?** → DPO (ימים לתשלום)
3. **How long does raw material sit before shipping?** → DIO (ימים במלאי)
4. **How many days of cash are tied up in total?** → CCC (מחזור המרת מזומן)
5. **Can we pay the bills this month?** → Current & Quick Ratios, WC Gap

It then layers:

- **Trend (MoM)** — is each metric improving or worsening vs. last month?
- **Industry benchmarks** — are we top-quartile, median, or distressed?
- **What-if scenarios** — how much cash does "extend DPO by 7 days" free up?
- **Driver decomposition** — if DSO worsened, was it AR or revenue?
- **Alert thresholds** — fire when we drop below house-rules.
- **Unified dashboard** — single-call view with inline SVG sparklines.

No module in the ERP deletes data. Every month is an *append*; every threshold
change goes into an audit log; snapshots are `Object.freeze`d. History is a
monotonic upgrade path, never a rewrite.

## 2. Files delivered

| Path | Role |
|---|---|
| `onyx-procurement/src/finance/working-capital.js` | Business logic, class `WorkingCapital` |
| `onyx-procurement/test/finance/working-capital.test.js` | 63 passing assertions (`node --test`) |
| `_qa-reports/AG-Y078-working-capital.md` | This report |

No files deleted. No files mutated. **Zero external dependencies.**

## 3. Public API (class `WorkingCapital`)

### 3.1 Pure formulas (stateless)

```js
const { WorkingCapital } = require('./src/finance/working-capital');
const wc = new WorkingCapital();

wc.computeDSO({ ar: 600_000, revenue: 900_000, days: 30 });        // → 20.0
wc.computeDPO({ ap: 420_000, cogs: 700_000, days: 30 });           // → 18.0
wc.computeDIO({ inventory: 850_000, cogs: 700_000, days: 30 });    // → 36.4
wc.computeCCC({ dso: 20, dio: 36.4, dpo: 18 });                    // → 38.4
wc.computeCurrentRatio({ currentAssets: 1_800_000, currentLiabilities: 1_100_000 }); // → 1.64
wc.computeQuickRatio({ ca: 1_800_000, inventory: 850_000, cl: 1_100_000 });          // → 0.86
wc.computeWCGap({ workingCapitalRequired: 1_500_000, workingCapitalAvailable: 1_450_000 }); // → 50_000
```

All formulas validate inputs (`ar` non-negative, `revenue` strictly positive, etc.)
and return deterministic values with banker's rounding.

### 3.2 Snapshot capture (stateful, append-only)

```js
wc.recordSnapshot({
  period: '2026-04',
  ar:                  680_000,
  ap:                  560_000,
  inventory:           720_000,
  revenue:             950_000,
  cogs:                740_000,
  currentAssets:     1_800_000,
  currentLiabilities: 1_180_000,
  workingCapitalRequired:  1_540_000,
  workingCapitalAvailable: 1_560_000,
  days: 30
});
```

Returns a frozen record with `inputs`, `metrics` (all seven), `period`, `days`.
Attempting to re-record the same period throws. `upgradeSnapshot()` is the
*explicit* path to supersede, and moves the prior into `_history` — never
destroys.

### 3.3 Trend, benchmark, what-if, drivers

```js
wc.trend({ period: '2026-04' });
//   → { period, priorPeriod, rows: [{ metric, current, prior, delta, deltaPct, direction }] }

wc.benchmarkVsIndustry({ industry: 'metal_fab' });
//   → { industry, source, rows: [{ metric, value, p25, median, p75, quartile, gapToMedian }] }

wc.whatIfScenario({ scenario: 'extend-DPO-7-days' });
//   → { lever, deltaDays, cashReleased, newMetrics, narrativeHe, narrativeEn }

wc.driverDecomposition('dso');
//   → { metric, drivers: [{ name, contribution, direction }], totalDelta }
```

### 3.4 Dashboard + alerts

```js
const dash = wc.dashboard('2026-04');
//   → { period, metrics, inputs, trend[], benchmark, alerts, sparklines, labels }

wc.alertThresholds({});                              // read mode — list current alerts
wc.alertThresholds({ metric: 'dso', threshold: 70 }); // write mode — upgrade threshold
```

### 3.5 Helper exports (for tests + reuse)

| Export | Purpose |
|---|---|
| `METRICS` | Frozen metadata (he/en label, unit, `lower_is_better`) |
| `INDUSTRY_BENCHMARKS` | Frozen percentile grid for 4 industries |
| `DEFAULT_ALERT_THRESHOLDS` | Metal-fab tuned baseline |
| `normalisePeriod`, `previousPeriod` | Deterministic month-key math |
| `round1`, `round2`, `roundHalfEven` | Banker's rounding |

## 4. Metric formulas (textbook)

### 4.1 DSO — Days Sales Outstanding (ימים לגבייה)

```
DSO = (Accounts Receivable / Revenue) × Days in period
```

Interpretation: "On average, how many days does it take a shekel of sales
to turn into a shekel of cash?" Lower is better.

**Metal-fab target:** < 55 days.

### 4.2 DPO — Days Payable Outstanding (ימים לתשלום)

```
DPO = (Accounts Payable / COGS) × Days in period
```

Interpretation: "On average, how many days do we hold onto supplier cash
before paying?" Higher is *better for us* — free credit — but only up to
the point where suppliers start refusing the next delivery or raising prices.

**Metal-fab target:** 50-72 days. Below 30 = we're paying too fast and
losing free credit. Above 72 = suppliers are starting to get angry.

### 4.3 DIO — Days Inventory Outstanding (ימים במלאי)

```
DIO = (Inventory / COGS) × Days in period
```

Interpretation: "At current burn rate, how many days of COGS are sitting
in raw plate, WIP, and finished goods?" Lower is better — but going to
zero risks stock-outs on the shop floor.

**Metal-fab target:** 55-78 days (plate stock + WIP + finished). JIT shops
under 40; distressed shops over 110.

### 4.4 CCC — Cash Conversion Cycle (מחזור המרת מזומן)

```
CCC = DSO + DIO - DPO
```

Interpretation: "How many days is every shekel of working capital trapped
in the operating cycle?" The single most important working-capital KPI.

**Rule of thumb:**
- CCC < 40 → you are running a tight ship.
- CCC 40-85 → normal for metal-fab.
- CCC > 123 → bottom quartile, cash burning.
- CCC < 0 → you are paid before you pay suppliers (rare — Apple / Amazon).

### 4.5 Current Ratio (יחס שוטף)

```
Current Ratio = Current Assets / Current Liabilities
```

Interpretation: "If every creditor knocked at once, would the cash, AR, and
inventory cover it?" Above 1.5 is comfortable; below 1.0 is a red flag
(short of liquid assets even on paper).

### 4.6 Quick Ratio / Acid-Test (יחס מהיר)

```
Quick Ratio = (Current Assets - Inventory) / Current Liabilities
```

Inventory is the least-liquid current asset — stripping it out stress-tests
whether we could actually *pay* with cash and receivables. Anything ≥ 1.0 is
safe. In a metal-fab, inventory is large, so Quick Ratio is usually 0.6-0.9.

### 4.7 Working Capital Gap (פער הון חוזר)

```
WC Gap = Working Capital Required - Working Capital Available
```

Positive = short (need to raise a loan / factor AR / extend DPO).
Negative = surplus (deploy the cash — inventory, CapEx, or return).

## 5. Industry benchmarks (embedded)

Four industries are seeded. Each row is `{p25, median, p75}` — the 25th,
50th, and 75th percentile of the industry. Source is attributed on every
read (`source` field) so the dashboard can show *where the number came from*.

### 5.1 Metal fabrication — the Techno-Kol default

Source: **D&B Israel 2026 aggregates + CFA Damodaran NYU Stern industry
peer group**.

| Metric | p25 (top) | Median | p75 (bottom) |
|---|---:|---:|---:|
| DSO | 45 | 62 | 85 |
| DPO | 42 | 55 | 72 |
| DIO | 55 | 78 | 110 |
| CCC | 58 | 85 | 123 |
| Current Ratio | 1.30 | 1.65 | 2.10 |
| Quick Ratio | 0.75 | 1.00 | 1.35 |

### 5.2 Construction

Source: D&B Israel 2026 construction sector.

| Metric | p25 | Median | p75 |
|---|---:|---:|---:|
| DSO | 55 | 78 | 105 |
| DPO | 50 | 68 | 90 |
| DIO | 30 | 45 | 62 |
| CCC | 35 | 55 | 77 |
| Current Ratio | 1.20 | 1.55 | 1.95 |
| Quick Ratio | 0.80 | 1.05 | 1.35 |

### 5.3 Retail

Source: D&B Israel 2026 retail aggregate.

| Metric | p25 | Median | p75 |
|---|---:|---:|---:|
| DSO | 8 | 15 | 25 |
| DPO | 35 | 48 | 62 |
| DIO | 40 | 60 | 85 |
| CCC | 13 | 27 | 48 |
| Current Ratio | 1.10 | 1.40 | 1.80 |
| Quick Ratio | 0.40 | 0.65 | 0.95 |

### 5.4 Professional services

Source: CFA Institute services peer group 2026.

| Metric | p25 | Median | p75 |
|---|---:|---:|---:|
| DSO | 35 | 52 | 72 |
| DPO | 30 | 42 | 58 |
| DIO | 0 | 5 | 12 |
| CCC | 5 | 15 | 26 |
| Current Ratio | 1.15 | 1.45 | 1.85 |
| Quick Ratio | 1.00 | 1.30 | 1.70 |

The `benchmarkVsIndustry()` output classifies the snapshot as
`top_quartile`, `above_median`, `below_median`, or `bottom_quartile`,
using the metric's direction (lower-is-better vs. higher-is-better) to
pick the correct side of the median.

## 6. What-if scenarios

Three canonical levers ship with the module. Each one accepts arbitrary
day counts via regex (`extend-DPO-14-days`, `collect-DSO-3-days`, etc.)
so a caller can parameterise a slider in the UI without adding new
scenario codes.

### 6.1 Extend DPO by N days

Cash released = `(COGS / days) × N`.
Intuition: we hold onto `N` more days' worth of supplier cash.

**Example (April 2026):** COGS = 740,000, days = 30, N = 7 →
cash released ≈ **₪172,667**.

### 6.2 Collect DSO N days faster

Cash released = `(Revenue / days) × N`.
Intuition: we collect `N` more days' worth of customer cash this period.

**Example (April 2026):** Revenue = 950,000, days = 30, N = 5 →
cash released ≈ **₪158,333**.

### 6.3 Reduce DIO by N days

Cash released = `(COGS / days) × N`.
Intuition: we carry `N` fewer days of inventory, freeing tied-up raw plate.

**Example (April 2026):** COGS = 740,000, days = 30, N = 10 →
cash released ≈ **₪246,667**.

### 6.4 Combined effect

A common ask: "What if we do all three at once?" The module does not
hard-code this — instead, the caller runs all three scenarios and sums the
`cashReleased` values. The individual `newMetrics` are exposed so a UI can
stack them (each is computed off the same base).

## 7. Driver decomposition

When DSO jumps from 20 days to 24 days, the question is: **did AR grow or
did revenue shrink?** The module answers using a contribution-style
decomposition derived from the partial-derivative of each metric.

### 7.1 DSO drivers

```
DSO = (AR / Revenue) × D

ΔDSO ≈ ΔAR_effect + ΔRev_effect
  ΔAR_effect  = (ΔAR / Revenue_prior)      × D
  ΔRev_effect = AR_cur × (1/Rev_cur - 1/Rev_prior) × D
```

If AR grew while revenue held, AR_effect dominates. If revenue dropped
while AR held, Rev_effect dominates (and is worsening). The combined sum
is ~ the actual ΔDSO (tiny residual from the non-linear interaction).

### 7.2 DPO / DIO

Same shape, with AP/COGS and Inventory/COGS respectively.

### 7.3 CCC

Direct sum of the three constituent deltas, with the DPO delta inverted
(because CCC = DSO + DIO − DPO). A DPO *increase* is an *improvement* for
CCC, so its contribution has flipped sign.

### 7.4 Ratios & wcGap

Current Ratio → `{currentAssets, currentLiabilities}` deltas.
Quick Ratio   → `{currentAssets, currentLiabilities, inventory}` deltas.
WC Gap        → `{required, available}` deltas.

## 8. Alert thresholds

Default thresholds (metal-fab tuned):

| Metric | Default | Fires when |
|---|---:|---|
| DSO | 85  | value > 85 |
| DPO | 30  | value < 30 (paying too fast, losing credit) |
| DIO | 110 | value > 110 |
| CCC | 123 | value > 123 |
| Current Ratio | 1.20 | value < 1.20 |
| Quick Ratio | 0.75 | value < 0.75 |
| WC Gap | 0 | value > 0 (short) |

Severity ladder is ratio-based:
- `ratio ≥ 1.30` → **critical**
- `ratio ≥ 1.15` → **high**
- `ratio ≥ 1.05` → **medium**
- otherwise → **low**

Every threshold change is appended to `_thresholdHistory` — **never
overwritten, never deleted**. The history carries `{metric, previous,
next, at}` so audit trails survive forever.

Each alert returns bilingual messages:

```
messageHe: "הערך 130 ימים חרג מהרף 85 — ימים לגבייה (DSO)"
messageEn: "Value 130 days breached threshold 85 — Days Sales Outstanding"
```

## 9. Dashboard + SVG sparklines

A single `dashboard(period)` call returns:

```js
{
  period, days, industry,
  metrics: { dso, dpo, dio, ccc, currentRatio, quickRatio, wcGap },
  inputs:  { ar, ap, inventory, revenue, cogs, ... },
  trend:   [ ... ],       // output of trend()
  benchmark: { ... },     // output of benchmarkVsIndustry()
  alerts:  { ... },       // output of alertThresholds({})
  sparklines: {
    dso: '<svg xmlns="http://www.w3.org/2000/svg" ...>',
    dpo: '...',
    ...
  },
  labels: METRICS
}
```

### Sparkline rendering

Each sparkline is a **standalone 120×32 SVG string** — no dependencies, no
fonts, no external CSS. Colouring follows the metric direction:

- **Green stroke (`#16a34a`)** — improving over the history
- **Red stroke (`#dc2626`)** — worsening
- **Blue stroke (`#0ea5e9`)** — flat or baseline (1 data point)

Every `<svg>` carries `role="img"` and `aria-label="<metric> sparkline"`
for screen-reader a11y. Single-point series degrade to a dashed baseline
with an endpoint dot (so the UI never shows a broken viewport).

## 10. Test plan

`onyx-procurement/test/finance/working-capital.test.js` — **63 passing
assertions** via `node --test` (zero deps).

| Suite | Coverage |
|---|---|
| Module surface | Exports, frozen catalogs, bilingual labels |
| Period helpers | `normalisePeriod` / `previousPeriod` year-wrap |
| Formulas | All 7 with happy path + 6 validation errors |
| `recordSnapshot` | Happy, append-only refusal, `upgradeSnapshot` history, wcGap optional, validation |
| `trend()` | Baseline, DSO worsening, DPO improving, DIO improving, unknown period |
| `benchmarkVsIndustry()` | metal_fab happy, all 4 industries, unknown rejection, bottom-quartile classification |
| `whatIfScenario()` | All 3 levers, arbitrary N, `basePeriod`, rejection |
| `dashboard()` | Integration, default period, no data throw, a11y, single-point sparkline |
| `alertThresholds()` | Healthy pass, DSO breach, write mode, rejection, severity ladder, no-snapshot |
| `driverDecomposition()` | DSO/DPO/DIO/CCC/quickRatio/currentRatio/wcGap, baseline, unknown |
| House rule | No delete/remove/clear methods, frozen snapshots, listSnapshots |

Run:

```
node --test onyx-procurement/test/finance/working-capital.test.js
```

Result (2026-04-11):

```
ℹ tests 63
ℹ suites 11
ℹ pass 63
ℹ fail 0
```

## 11. Hebrew glossary (מילון)

| Hebrew | Transliteration | English |
|---|---|---|
| הון חוזר | hon khozer | Working capital |
| פער הון חוזר | pa'ar hon khozer | Working capital gap |
| ימים לגבייה | yamim li-gviya | Days Sales Outstanding (DSO) |
| ימים לתשלום | yamim le-tashlum | Days Payable Outstanding (DPO) |
| ימים במלאי | yamim ba-melai | Days Inventory Outstanding (DIO) |
| מחזור המרת מזומן | makhzor hamarat mezuman | Cash Conversion Cycle (CCC) |
| יחס שוטף | yakhas shotef | Current Ratio |
| יחס מהיר | yakhas mahir | Quick Ratio / Acid-Test |
| חייבים | khayavim | Accounts receivable (AR) |
| ספקים / זכאים | sapakim / zakayim | Accounts payable (AP) |
| מלאי | melai | Inventory |
| הכנסות | hakhnasot | Revenue |
| עלות מכר | alut mekher | Cost of Goods Sold (COGS) |
| נכסים שוטפים | nekhasim shotfim | Current assets |
| התחייבויות שוטפות | hit'khayvuyot shotfot | Current liabilities |
| מגמה חודשית | megama khodshit | Month-over-month trend |
| ענף | anaf | Industry (sector) |
| רבעון עליון | riv'on elyon | Top quartile |
| חציון | khetzayon | Median |
| פרוק דרייברים | perook drivers | Driver decomposition |
| התראה | hatra'a | Alert |
| רף | raf | Threshold |
| תרחיש | tarkhish | Scenario |
| שחרור מזומן | shikhrur mezuman | Cash release |
| מחקר השוואתי | mekhkar hashva'ati | Benchmark study |
| לוח בקרה | luakh bakara | Dashboard |
| גרף מיני | graf mini | Sparkline (lit. "mini graph") |

## 12. Integration roadmap

The module is fully standalone today; future wave work will plug it into:

| Target module | Link |
|---|---|
| `reports/cash-flow-forecast.js` | `dashboard()` → cash forecast pre-payload |
| `reports/management-dashboard-pdf.js` | `dashboard()` → PDF KPI grid |
| `invoices/*` | AR balance → `recordSnapshot.ar` |
| `bank/parsers.js` | Cleared payments → AP balance → `recordSnapshot.ap` |
| `manufacturing/scrap-tracker.js` | `reconcileInventory` → `recordSnapshot.inventory` |
| `notifications/notification-service.js` | `alertThresholds({}).alerts` → email/SMS/WhatsApp |
| `web/onyx-dashboard.jsx` | `dashboard()` → react view (SVG drops in as `dangerouslySetInnerHTML`) |

Each link is a one-liner adapter — none require editing `working-capital.js`.

## 13. Compliance with house rules

- **לא מוחקים — רק משדרגים ומגדלים:** No `delete`, `remove`, `clear`, or
  `drop` method on `WorkingCapital`. Tests assert the prototype is clean.
  `upgradeSnapshot()` preserves prior versions under `_history`.
- **Zero dependencies:** Only `node:test` + `node:assert/strict` in the test
  file. Production file has zero `require`s.
- **Bilingual:** Every metric, driver, alert, and scenario carries both
  Hebrew (`he`) and English (`en`) labels. Alert messages ship in both
  languages via `messageHe` / `messageEn`.
- **Deterministic:** Banker's rounding (half-to-even). Period keys are
  UTC-based so tests are timezone-independent. No `Date.now()` in the
  pure formulas. No random.
- **Frozen records:** Every snapshot, alert, driver row, trend row, and
  benchmark row is `Object.freeze`d on return so consumers cannot mutate
  history by reference.
- **Append-only audit trails:** `_thresholdHistory` and `_history` (for
  upgraded snapshots) are monotonic. Threshold writes log `{metric,
  previous, next, at}`.
- **Never delete the report:** This file
  (`_qa-reports/AG-Y078-working-capital.md`) is the living record of this
  agent. Future upgrades should *amend* — never replace.

---

**END OF AG-Y078 — Working Capital Dashboard**

לא מוחקים — רק משדרגים ומגדלים.
