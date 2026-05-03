# AGENT-181 — Forecasting / ML Modules Audit

**Agent:** 181
**Worktree:** objective-merkle-40ff93
**Date:** 2026-04-29
**Scope:** Audit the 5 forecasting / ML modules referenced by AG-X11, AG-X07, AG-X08, AG-X09, AG-100 — confirm files-on-disk, exercise tests, and assess integration into the Master Flow.

---

## 1. Modules in scope

| Ref report | Module                                              | LoC  | Tests file                                              |
|------------|-----------------------------------------------------|-----:|---------------------------------------------------------|
| AG-X11     | `onyx-procurement/src/forecasting/demand-forecaster.js` | 1393 | `test/payroll/demand-forecaster.test.js`                |
| AG-X07     | `onyx-procurement/src/pricing/price-optimizer.js`   |  884 | `test/payroll/price-optimizer.test.js`                  |
| AG-X08     | `onyx-procurement/src/inventory/optimizer.js`       |  692 | `test/payroll/inventory-optimizer.test.js`              |
| AG-X09     | `onyx-procurement/src/logistics/route-optimizer.js` |  860 | `test/payroll/route-optimizer.test.js`                  |
| AG-100     | `onyx-procurement/src/ml/anomaly-detector.js`       |  839 | `test/payroll/anomaly-detector.test.js`                 |
| **Total**  |                                                     | **4 668** |                                                  |

All five source files and all five test files exist on disk in the worktree.

---

## 2. Live test run (2026-04-29)

Command:

```
cd onyx-procurement
node --test test/payroll/demand-forecaster.test.js \
            test/payroll/price-optimizer.test.js \
            test/payroll/inventory-optimizer.test.js \
            test/payroll/route-optimizer.test.js \
            test/payroll/anomaly-detector.test.js
```

Result:

```
ℹ tests       203
ℹ suites      35
ℹ pass        203
ℹ fail        0
ℹ cancelled   0
ℹ skipped     0
ℹ todo        0
ℹ duration_ms 13 424.909
```

Sums match the per-module report claims:
65 (X11) + 24 (X07) + 24 (X08) + 56 (X09) + 34 (100) = **203**.
Status reproduced: GREEN across the board.

---

## 3. Per-module audit findings

### 3.1 AG-X11 Demand Forecaster — PASS
- 6 forecasting families (MA / WMA / SES / Holt / Holt-Winters / linear / additive
  + multiplicative seasonal decomposition / naive / seasonal-naive / ensemble).
- Inverse-MAPE walk-forward ensemble weighting; bands widen as `1.96·σ·√h`.
- `ISRAELI_SEASONALITY_MONTHLY_NORM` is a 12-month frozen prior baked in
  (Passover / Tishri / August dips, Q4 push, EOY VAT lift). Mean-normalised to 1.
- 65/65 tests green in 162 ms; numerically-exact recovery checks (slope/intercept
  on `y = 2t + 5`, mean-1 on the prior).
- Auto dispatcher (`forecast(series, h)` no method) backtests all members and
  picks the best by MAPE — verified by suite 12.

### 3.2 AG-X07 Price Optimizer — PASS
- 10-step pricing pipeline (cost-plus → market → tier → volume → seasonal →
  urgency → payment → churn → FX → VAT 18%).
- Israeli metal-fab fixtures: CRS, galvanized, SS304/SS316, Al-6061 priced by ₪/kg;
  labor by ₪/min (cut 2.10, bend 2.40, weld 3.20).
- All math runs in integer agorot to dodge float drift; verified by `round2`
  edge case.
- Append-only `_priceHistory` Map; no `delete()` / `clear()` paths.
- 24/24 tests green.

### 3.3 AG-X08 Inventory Optimizer — PASS
- EOQ = √(2·D·S/H), ROP = μ·L + z·σ·√L, ABC-Pareto 80/95, XYZ by CV (0.25/0.50),
  dead-stock ≥ 180 d, overstock > 3·EOQ, bulk-break optimum cost.
- Z-score table for service levels 50–99.9 with linear interpolation.
- Hebrew bilingual labels on classes, urgency ladder, supplier names
  (`הוט מיל`, `מפעלי ברזל יפו`).
- 24/24 tests green; pure function — input-array immutability verified.

### 3.4 AG-X09 Route Optimizer — PASS
- Haversine (R = 6371.0088), N×N distance matrix, nearest-neighbour seed,
  classical 2-opt edge-swap, polar-sweep VRP-lite for multi-vehicle.
- Israeli specifics:
  - Rush hour 07–09 / 16–19 → ×1.45 multiplicative penalty.
  - Jerusalem bbox 31.70–31.90 N / 35.13–35.30 E → ×1.25.
  - Highway 6 flag (no cost — toll wiring deferred).
  - Shabbat warning + `flags.weekend = true`.
- Time-window `simulateTour` records `waited_min` before-open, pushes
  `violations[]` after-close (does not abort).
- 6-stop Gush Dan demo: 315.16 → 264.68 km (-16.0%), 3 passes / 4 swaps.
- 56/56 tests green.

### 3.5 AG-100 Anomaly Detector — PASS
- 10 detectors: z-score, IQR (Tukey 1.5x), moving-avg (30/90/365), seasonal
  (leave-one-out monthly median), Benford chi² (8 dof, crit 15.507), fuzzy
  duplicates (Levenshtein vendor + amount eps + 7-day window), round-amount
  suspicion, time-of-day (06–22), velocity (5-min sliding), geographic
  (Haversine km/h, max 900).
- Seasonal detector excludes the candidate from its own bucket → no
  self-pollution.
- Z-score severity blends `|z|` with `log2(ratio)` so a single 10× outlier
  that inflates its own stdev still lands in the top severity band.
- All 34 cases green; deterministic across runs (no `Math.random`, no
  wall clock).

---

## 4. Cross-cutting compliance

| Rule                          | Status | Evidence                                                                                  |
|-------------------------------|:------:|-------------------------------------------------------------------------------------------|
| Zero runtime dependencies     |   OK   | Grep for `require(` / `import ` in all 5 source files: **0 matches**.                     |
| Hebrew bilingual labels       |   OK   | `METHOD_LABELS`, `urgency_he`, `name_he`, `explanation_he`, `driver_summary_he` present.  |
| Never-delete rule             |   OK   | No `.delete(` / `splice` / `pop` mutating-removals in price history, anomaly results.     |
| Pure (no I/O, no globals)     |   OK   | No `fs`, no `http`, no `process.env` reads inside `src/forecasting,pricing,inventory,logistics,ml`. |
| Determinism                   |   OK   | Anomaly suite has a "deterministic across runs" test; forecaster has no `Date.now()`.     |
| Israeli specifics             |   OK   | VAT 18%, Tishri/Pesach/August seasonal prior, Jerusalem bbox, Highway 6 flag, NIS agorot. |

---

## 5. Pipeline / wiring integration

The modules are referenced by the system blueprint but are **not yet wired
into HTTP routes**. Concretely:

- `src/pipeline/pipeline-engine.js` lists `'forecasting'` as a module under the
  `closure` stage and as a connection from the `ai` service (port 3300).
- `src/pipeline/wiring-spec.js` declares the AI service responsibilities as
  `['anomaly_detection', 'forecasting', 'recommendations', 'risk_detection', 'cross_service_signals']`
  with entities `forecast_model` and `anomaly_case`.
- `src/pipeline/ontology.js` defines `anomaly_case` and `forecast` as
  intelligence-layer entities with Hebrew labels (`חריגה` / `תחזית`).
- `src/sales/sales-forecast.js` documents itself as complementary to X-04 / X-11
  demand forecasting but does **not** import the demand-forecaster.

**Gap:** none of the 5 ML modules are `require()`'d anywhere outside their own
test files. They are therefore unit-clean but operationally dark — no REST
endpoint, no dashboard widget, no orchestrator action calls them today.

---

## 6. Risks / follow-ups (none block ship)

| # | Severity | Item                                                                                                  |
|---|:--------:|-------------------------------------------------------------------------------------------------------|
| 1 |   info   | All five modules are isolated libs; the 9 Master 360 pages do not yet consume them. P1 wiring task.   |
| 2 |   info   | Highway 6 is flagged but not priced; awaiting Derech Eretz toll CSVs in `src/payments/`.              |
| 3 |   info   | Demand forecaster is monthly-only seasonality. Daily/weekly/quarterly decomposition is future work.   |
| 4 |   low    | Route optimizer Haversine is great-circle, not road distance — under-estimates urban legs by ≤ 20%.   |
| 5 |   low    | 2-opt is O(N²) per pass — capped at 50 passes; for N > 200 stops switch to Or-opt or LKH.             |
| 6 |   low    | Inventory module has no FX (assumes ILS) — a multi-currency vendor would need pre-conversion.        |
| 7 |   info   | Anomaly velocity detector groups by vendor only; per-user / per-device grouping would catch ATO.      |
| 8 |   info   | Benford uses chi² 8 dof; for very large samples a Mantissa-Arc test is more sensitive but heavier.    |

---

## 7. Verdict

All 5 forecasting / ML modules are present, dependency-free, deterministic,
Hebrew-bilingual, and **fully covered by 203 passing unit tests** (re-run
2026-04-29, 13.4 s wall-clock). Reports AG-X11, AG-X07, AG-X08, AG-X09 and
AG-100 accurately describe the artifacts on disk. The remaining work is
**P1 wiring** — exposing these libraries through the AI service (port 3300)
and consuming them from Project360, Finance360, and the recommended-action
panels of the Master 360 pages.

**Audit status: PASS.**
