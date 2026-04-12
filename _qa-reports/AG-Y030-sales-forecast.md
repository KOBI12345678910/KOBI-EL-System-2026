# AG-Y030 — Sales-Side Forecasting (SalesForecast)

**Agent:** Y-030 — Swarm Sales-Ops
**System:** Techno-Kol Uzi Mega-ERP (Kobi EL) — Wave 2026
**Module:** `onyx-procurement/src/sales/sales-forecast.js`
**Test:** `onyx-procurement/test/sales/sales-forecast.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — Complement to X-04 / X-11

The mega-ERP already has **demand forecasting** (Agent X-04 financials and
X-11 `onyx-procurement/src/forecasting/demand-forecaster.js`), which is
**finance-side** — it projects procurement / demand / inventory based on
historical time series using Holt-Winters and friends.

This module adds the **sales-side**: it projects **bookings** (closed-won
revenue) off the live CRM pipeline. The two sides complement each other:

| Side | Input | Typical method | Used by |
|---|---|---|---|
| **Finance / demand** (X-04/X-11) | historical monthly series | Holt-Winters / ensemble | CFO, purchasing, inventory |
| **Sales / bookings** (Y-030) | live opportunity pipeline | commit / stage-weighted / Monte Carlo | VP Sales, sales managers |

They meet in the **S&OP** (Sales & Operations Planning) review: the
finance-side demand forecast is reconciled against the sales-side bookings
forecast to catch systemic over/under-planning.

---

## 2. Public API

```js
const { SalesForecast } = require('./src/sales/sales-forecast.js');

const sf = new SalesForecast({
  stageProbabilities: { /* override defaults */ },
  winRates: { rep_a: 0.80, rep_b: 0.45 },
  fallbackWinRate: 0.20,
  hierarchy: { rep_a: 'mgr_1', rep_b: 'mgr_1' },
  staleDays: 30,
});
```

### 2.1 `buildForecast({ pipeline, period, method, trials?, seed?, winRates? })`

Builds a forecast using one of **five** methods. Returns
`{ method, total, dealCount, deals, period, method_label, generatedAt, ... }`
plus method-specific fields (e.g. Monte Carlo adds `mean`, `stdev`,
`percentiles`, `confidence_bands`, `analytical`).

### 2.2 `rollup(salespeopleForecasts, managerId)`

Aggregates per-rep forecasts into a manager-level total. Respects
`this.hierarchy` so reps not reporting to `managerId` are excluded.
Flags **sandbagging** and **inflation** per rep.

### 2.3 `variance(forecast, actual)`

Computes forecast accuracy:
- `variance` = actual - forecast (signed)
- `variancePct` = variance / forecast
- `accuracyScore` = `1 - min(|variancePct|, 1)` in [0, 1]
- `bias` ∈ { `accurate`, `under-forecast`, `over-forecast` }

### 2.4 `snapshotForecast(date, { forecast? })`

Freezes the most recent (or explicit) forecast under `date` so
`forecastTrend()` can compare week-over-week. Snapshots are **deep-frozen**
and cannot be mutated after the fact — they are historical facts.

### 2.5 `forecastTrend(period)`

Returns the chronological series of snapshots for `period` plus:
- `totalDelta` — newest - oldest
- `wowDelta` — newest - previous
- `slippingDealIds` — deals present in the previous snapshot but missing
  from the latest (they slipped out of period)
- bilingual `summary_he` / `summary_en`

### 2.6 `categorizeDeal(opportunity)`

Auto-categorizes a single deal into `commit` / `best-case` / `pipeline`
/ `omitted` buckets based on probability thresholds, and flags stale deals.

### 2.7 `generateForecastCall(forecast)`

Produces a **bilingual Hebrew + English** review script for the weekly
sales-manager forecast call. Includes opener, headline, method-specific
detail, and the five standard review questions.

---

## 3. Method Comparison

| Method | Formula | Returns | Use case |
|---|---|---|---|
| **commit** | `Σ amount` where `p ≥ 0.90` and `closeDate ∈ period` | Conservative | Board-level committed number; career-impacting |
| **best-case** | `Σ amount` where `p > 0` and `closeDate ∈ period` | Upper bound | "If everything closes" scenario |
| **stage-weighted** | `Σ (amount × p)` where `closeDate ∈ period` | Classical CRM forecast | Default dashboard number |
| **historical-win-rate** | `Σ (amount × repWinRate)` where `closeDate ∈ period` | Per-rep probabilistic | Corrects for biased stage probabilities; anti-sandbag |
| **monte-carlo** | 10k Bernoulli simulation trials | Full distribution (mean, stdev, p10–p95) | Risk assessment, confidence bands |

### Invariants

Guaranteed by the implementation and pinned by tests:

1. `commit ≤ stage-weighted ≤ best-case` for any valid pipeline.
2. For `monte-carlo`, the **simulated mean converges** to the
   **stage-weighted total** as trials → ∞ (law of large numbers).
3. For `monte-carlo`, the **analytical variance** is
   `Σ (amount² × p × (1−p))`; tests require the simulated stdev
   to be within **5% of the analytical** value at 10k trials.
4. Identical `(seed, trials, pipeline)` always produces identical Monte
   Carlo output (mulberry32 PRNG is seedable).

---

## 4. Monte Carlo Parameters

| Parameter | Default | Notes |
|---|---|---|
| `trials` | **10,000** | Brief specifies 10k. Convergence within 2% mean / 5% stdev of analytical values. |
| `seed` | `0xC0FFEE` (12648430) | Any 32-bit int. Mulberry32 PRNG. |
| Bernoulli model | per-deal | Each deal independently `won` with its own `probability`. |
| Output percentiles | p10, p25, p50, p75, p90, p95 | Linear-interpolated (not nearest-rank). |
| Confidence bands | p80 (10–90), p90 (5–95) | Returned via `confidence_bands`. |

### PRNG: mulberry32

Lightweight, fast, high-quality uniform in `[0, 1)`. The same seed
always produces an identical stream — required for deterministic
tests and reproducible forecasts across runs.

```js
function mulberry32(seed) {
  let a = (seed | 0) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### Normal distribution (Box-Muller)

For future methods that need Gaussian sampling (e.g. amount-
uncertainty deals) we also ship `standardNormal(rng)` which
transforms two uniforms into `N(0, 1)`. Tests verify mean ≈ 0
and stdev ≈ 1 at 10k samples.

```js
function standardNormal(rng) {
  let u1 = rng();  while (u1 <= 0) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
```

---

## 5. Sandbagging Detection

"Sandbagging" = a rep intentionally reports a **lower** forecast than
their pipeline would suggest, so they can **beat expectations** and
preserve upside for next quarter. The opposite, "happy ears" /
**inflation**, is also detected.

### Algorithm

For each rep in a rollup we compute:

```
ratio = stageWeightedForecast / historicalWinRateForecast
```

| Ratio band | Classification | Meaning |
|---|---|---|
| `< 0.80` | **sandbagging** | Rep's stage-weighted number is much lower than their track record suggests — they're holding back |
| `0.80 – 1.25` | `ok` | Normal range, no flag |
| `> 1.25` | **inflation** | Rep's stage-weighted number exceeds what their track record supports — "happy ears" |

### Why this works

- `stageWeighted` uses the **deal's own** probability (rep's self-report).
- `historical-win-rate` uses the **rep's past conversion** (ground truth).
- A persistent gap between the two = forecasting bias.
- The direction of the gap tells you which kind of bias.

Each flagged rep gets a bilingual `note_he` / `note_en` explaining the
signal:

| Kind | Hebrew | English |
|---|---|---|
| sandbagging | הנציג עשוי לשמור עסקאות לרבעון הבא — יש לחקור | rep may be saving deals for next quarter — investigate |
| inflation | הנציג עשוי להיות אופטימי מדי — יש לבחון הסתברויות | rep may be over-optimistic ("happy ears") — review probabilities |

### Stale-deal signal

Complementary to sandbagging detection, `categorizeDeal` flags deals
whose `updatedAt` is more than `staleDays` (default 30) before "now".
Stale deals are another classic sandbagging tell: a rep stops touching
a deal they don't want to commit to, so it quietly ages out.

---

## 6. Hebrew Glossary — מילון עברי-אנגלי

| Hebrew | English | Meaning |
|---|---|---|
| תחזית מכירות | Sales forecast | The projected bookings for a future period |
| מחויב | Commit | Deal the rep pledges will close in-period (p ≥ 0.90) |
| תרחיש אופטימי | Best case | Sum of every in-period deal if everything closes |
| משוקלל לפי שלב | Stage-weighted | amount × stage probability |
| אחוז זכייה היסטורי | Historical win rate | Rep's personal conversion % over past N quarters |
| סימולציית מונטה-קרלו | Monte Carlo simulation | 10k random trials of deal outcomes |
| צנרת | Pipeline | All active opportunities |
| צנרת משוקללת | Weighted pipeline | Same as stage-weighted |
| הסתברות סגירה | Close probability | `p` in [0,1] — likelihood the deal closes |
| תאריך סגירה צפוי | Expected close date | The date the rep projects the deal will close |
| סטטוס עסקה | Deal stage | Qualification / Proposal / Negotiation / Commit / Closed-Won |
| נציג מכירות | Sales rep | The owner of a deal |
| מנהל מכירות | Sales manager | Owner of a rollup; runs the forecast call |
| שיחת תחזית | Forecast call | Weekly review where manager pressure-tests each rep |
| שחיקה | Slippage | Deal that moved out of the period between snapshots |
| סחבנות בתחזית | Sandbagging | Rep reports low to beat expectations |
| אוזניים שמחות | Happy ears (inflation) | Rep reports high from over-optimism |
| סנאפשוט תחזית | Forecast snapshot | Frozen copy of a forecast at a point in time |
| סטיית תקן | Standard deviation | Spread of the Monte Carlo distribution |
| רווח סמך | Confidence interval | p10–p90 band around the MC mean |
| דיוק תחזית | Forecast accuracy | 1 − \|variance\| / forecast |
| סטייה | Variance | actual − forecast (signed) |
| פער | Gap | Forecast shortfall vs quota |

---

## 7. Test Coverage

File: `onyx-procurement/test/sales/sales-forecast.test.js` —
**78 tests, all passing**.

| Section | Tests | Focus |
|---|:-:|---|
| SF.1 date & period helpers | 5 | `inPeriod`, boundary dates, Date instances |
| SF.2 normalizeDeal | 7 | stage lookup, probability clamp, negative guards, case insensitivity |
| SF.3 commit method | 4 | p ≥ 0.90 only, out-of-period excluded, 0.895 vs 0.900 boundary |
| SF.4 best-case method | 3 | sum of in-period non-zero, monotonicity vs stage-weighted |
| SF.5 stage-weighted method | 3 | manual Σ(amount×p), weightedAmount field, equality with MC analytical mean |
| SF.6 historical-win-rate | 3 | per-rep rates, fallback, scalar override |
| **SF.7 monte-carlo (convergence)** | **8** | **mean convergence, stdev convergence, determinism, monotone percentiles, all-committed edge, coin-flip invariant, empty-pipeline edge** |
| SF.8 variance | 6 | perfect, under, over, raw numbers, floor at 0, divide-by-zero safety |
| SF.9 rollup + sandbagging | 7 | sums, hierarchy filter, sandbag detection, inflation detection, normal-band no-flag, insufficient-data edge, nested shape |
| SF.10 snapshot + forecastTrend | 5 | frozen copy, explicit forecast, throws without state, total/WoW delta, slipping-deal detection, no-slipping path |
| SF.11 categorizeDeal | 7 | commit/best-case/pipeline/omitted bands, stale detection, bilingual label |
| SF.12 generateForecastCall | 4 | bilingual, sections completeness, MC-specific detail, throws on null |
| SF.13 purity | 3 | pipeline non-mutation, period non-mutation, snapshot deep-freeze |
| SF.14 PRNG + standardNormal | 4 | determinism, range, Box-Muller mean ≈ 0, stdev ≈ 1 |
| SF.15 percentile helper | 3 | p50 of 1..100, min/max at 0/1, empty array |
| SF.16 bilingual labels | 2 | every method has he+en, every category has he+en |
| SF.17 error handling | 4 | non-array pipeline, missing period, unknown method, null rollup |

Run:
```bash
cd onyx-procurement
node --test test/sales/sales-forecast.test.js
```

Result: `tests 78 / pass 78 / fail 0`.

---

## 8. Purity & Non-Destructiveness

The module obeys the **לא מוחקים רק משדרגים ומגדלים** rule:

1. **Never mutates inputs** — pipeline and period objects are deep-read
   only; pinned by `SF.13.01` and `SF.13.02` via `JSON.stringify` snapshots
   before/after.
2. **Snapshots are historical facts** — `snapshotForecast` returns a
   `deepFreeze`'d copy. Trying to mutate a stored snapshot is a no-op
   (strict-mode TypeError). Pinned by `SF.10.01` and `SF.13.03`.
3. **No delete paths** — there is no `delete`, `remove`, or `clear`
   method on the public API. Snapshots accumulate in `_snapshots`;
   callers that want to prune old ones must re-instantiate.
4. **Zero external dependencies** — only Node built-ins (`Date`). Runs
   equally well in Node 16+, Electron, or a browser bundle.
5. **Deterministic** — Monte Carlo is seedable, so `(pipeline, period,
   method, trials, seed)` always produces identical output. Other
   methods have no randomness at all.

Upgrades (future waves) may add fields to the return shapes but
must not remove existing ones; tests pin the fields they depend on.

---

## 9. Integration Points

### With `src/forecasting/demand-forecaster.js` (X-11)

The two modules share no code but complement each other in the
**S&OP review**. A future cross-reconciliation agent can ingest:

- demand-side forecast: `forecast(monthlyBookingsSeries, 3).predictions`
- sales-side forecast: `sf.buildForecast({ pipeline, period, method: 'stage-weighted' }).total`

…and compare them. A persistent gap flags a systemic bias in either
the CRM pipeline hygiene or the historical time-series model.

### With `src/reports/cash-flow-forecast.js`

Sales-side stage-weighted total → cash-in projection for the period,
once an **invoice-to-cash lag** is applied. The `generatedAt` timestamp
on every `SalesForecast` result makes it straightforward to join.

### With CRM pipeline data

The `pipeline` input is shape-agnostic as long as it carries
`{ id, amount, stage, probability?, closeDate, owner }`. A thin
adapter layer (future agent Y-031) can wrap Salesforce /
HubSpot / a bespoke table and project into this shape.

---

## 10. Files

| Path | Role |
|---|---|
| `onyx-procurement/src/sales/sales-forecast.js` | Business logic — 5 methods + rollup + variance + trend + categorize + call |
| `onyx-procurement/test/sales/sales-forecast.test.js` | Node `--test` suite, **78 tests** |
| `_qa-reports/AG-Y030-sales-forecast.md` | **This report — never delete.** |

---

## 11. Sample Output

### 11.1 commit forecast

```js
sf.buildForecast({
  pipeline: [
    { id: 'd1', amount: 100000, stage: 'commit', probability: 0.95, closeDate: '2026-05-01', owner: 'rep_a' },
    { id: 'd5', amount:  80000, stage: 'commit', probability: 0.90, closeDate: '2026-06-05', owner: 'rep_c' },
  ],
  period: { start: '2026-04-01', end: '2026-06-30', label: 'Q2-2026' },
  method: 'commit',
});

// → {
//     method: 'commit',
//     total: 180000,
//     dealCount: 2,
//     totalPipelineCount: 2,
//     deals: [...],
//     period: { start: '2026-04-01', end: '2026-06-30', label: 'Q2-2026' },
//     method_label: { he: 'מחויב (Commit)', en: 'Commit' },
//     generatedAt: '2026-04-11T...'
//   }
```

### 11.2 monte-carlo forecast

```js
sf.buildForecast({
  pipeline, period: Q2_2026,
  method: 'monte-carlo',
  trials: 10000, seed: 42,
});

// → {
//     method: 'monte-carlo',
//     total: 218503.50,   // ≈ simulated mean
//     mean:  218503.50,
//     stdev:  24812.17,
//     percentiles: { p10, p25, p50, p75, p90, p95 },
//     confidence_bands: { p80: [lo, hi], p90: [lo, hi] },
//     analytical: {
//       mean: 218500,
//       stdev: 24806.24,
//       variance: 615349500,
//     },
//     trials: 10000, seed: 42,
//     ...
//   }
```

### 11.3 sandbagging detection

```js
sf.rollup({
  rep_a: { 'stage-weighted':  50000, 'historical-win-rate': 100000 },
  rep_b: { 'stage-weighted': 100000, 'historical-win-rate': 100000 },
  rep_c: { 'stage-weighted': 200000, 'historical-win-rate': 100000 },
}, 'mgr_1');

// → {
//     managerId: 'mgr_1',
//     totals: { 'stage-weighted': 350000, 'historical-win-rate': 300000, ... },
//     sandbagging: [
//       { repId: 'rep_a', kind: 'sandbagging', ratio: 0.5,  note_he: '...', note_en: '...' },
//       { repId: 'rep_c', kind: 'inflation',   ratio: 2.0,  note_he: '...', note_en: '...' },
//     ],
//     reps: [...],
//     generatedAt: '2026-04-11T...'
//   }
```

### 11.4 forecast call script (bilingual)

```
שיחת תחזית — משוקלל לפי שלב — תקופה 2026-04-01 עד 2026-06-30

סה"כ תחזית: ₪218,500.00 מתוך 6 עסקאות.
כל עסקה משוקללת לפי הסתברות השלב שלה.

שאלות סקירה:
1. מה התקדם השבוע בעסקאות המחויבות?
2. האם יש עסקאות שהוזזו ברבעון? מדוע?
3. מהן 3 העסקאות הגדולות ביותר בסיכון?
4. אילו צעדים נדרשים כדי לסגור את הפער?
5. האם ההסתברויות שלך עדכניות?
```

```
Forecast Call — Stage-weighted — period 2026-04-01 to 2026-06-30

Total forecast: ₪218,500.00 across 6 deals.
Each deal weighted by its stage probability.

Review questions:
1. What moved in the commit deals this week?
2. Any deals that slipped out of quarter? Why?
3. What are the top 3 at-risk deals?
4. What actions are needed to close the gap?
5. Are your probabilities up-to-date?
```

---

## 12. Future Upgrades (Growth Path)

Items that a future wave can **add without breaking** the current API:

1. **Amount-uncertainty** — use `standardNormal` to model the deal
   amount as `N(amount, σ)` instead of a point value. Fold into the
   existing Monte Carlo loop.
2. **Correlation between deals** — deals at the same account or with
   the same customer are correlated. Add a `copula` option that
   couples their Bernoulli trials.
3. **Seasonal adjustment** — multiply the final forecast by
   `ISRAELI_SEASONALITY_MONTHLY_NORM[month]` borrowed from the
   demand-forecaster, to reflect Passover / Tishri / Q4-push patterns.
4. **Win-rate decay** — weight older wins less than recent ones when
   computing per-rep historical rates (exponential decay).
5. **Rep-level trend** — track how each rep's sandbag ratio evolves
   over quarters — persistent sandbagging is more actionable than a
   one-off flag.
6. **Territory rollup** — currently the rollup is by manager hierarchy.
   Add territory / segment / vertical rollups via a shared helper.
7. **What-if simulation** — given a set of hypothetical probability
   bumps, return the delta on each method — useful for coaching.

All of these can layer on top without removing anything.

---

**Status:** GREEN — all 78 tests pass, no open issues.
**Signed-off:** Agent Y-030 — 2026-04-11.
