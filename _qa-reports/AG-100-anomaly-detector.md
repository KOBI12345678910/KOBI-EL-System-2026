# AG-100 — Anomaly Detection Engine for Financial Transactions

**Agent:** 100
**System:** Techno-Kol Uzi mega-ERP
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 34 / 34 tests passing

---

## 1. Mission

Build a zero-dependency, pure-JS statistical anomaly detector for financial
transactions in the ONYX Procurement subsystem. The engine must run offline,
without touching HTTP, disk or databases, and must return bilingual
(Hebrew + English) explanations that are usable by non-technical reviewers.

## 2. Deliverables

| File | Purpose |
|---|---|
| `onyx-procurement/src/ml/anomaly-detector.js` | Engine — 10 detectors + helpers |
| `onyx-procurement/test/payroll/anomaly-detector.test.js` | 34 unit tests |
| `_qa-reports/AG-100-anomaly-detector.md` | This report |

Zero dependencies introduced. Zero files deleted.

## 3. Statistical Methods Implemented

| # | Method | Public function | Group granularity |
|---|---|---|---|
| 1 | Z-score (sample mean / stdev) | `detectZScore`, `computeZScore` | vendor + category |
| 2 | IQR — Tukey 1.5x rule | `detectIQR`, `quartile` | vendor + category |
| 3 | Moving-average deviation (30 / 90 / 365) | `detectMovingAverage`, `movingAverageAnomaly` | vendor + category |
| 4 | Simplified seasonal decomposition (monthly median with leave-one-out) | `detectSeasonal` | vendor + category |
| 5 | Benford's law (chi^2 on first significant digit) | `detectBenford`, `analyzeAgainstBenford`, `firstSignificantDigit` | vendor + category |
| 6 | Fuzzy duplicate detection (Levenshtein vendor + amount within eps + date within 7 days) | `detectDuplicates`, `findDuplicates`, `vendorSimilarity`, `levenshtein` | pair-wise |
| 7 | Round-amount suspicion | `detectRoundAmounts`, `isRoundAmount` | vendor |
| 8 | Time-of-day anomaly | `detectTimeOfDay` | per transaction |
| 9 | Velocity (sliding window) | `detectVelocity` | vendor |
| 10 | Geographic impossible-travel (haversine km/hour) | `detectGeographic`, `haversineKm` | per actor |

### Tunable Thresholds (`DEFAULTS`)

```
zScoreThreshold       : 3.0
iqrK                  : 1.5
movingWindows         : [30, 90, 365]
movingThreshold       : 3.0
benfordMinSamples     : 30
benfordChiCritical    : 15.507   (chi^2, 8 dof, p=0.05)
duplicateWindowDays   : 7
duplicateAmountEps    : 0.01 NIS
duplicateVendorSim    : 0.85
roundSuspicionMinPct  : 0.20
timeOfDayStartHour    : 06
timeOfDayEndHour      : 22
velocityWindowMinutes : 5
velocityMaxTxInWindow : 5
geoMaxKmPerHour       : 900
```

All thresholds can be overridden per call via the second argument to
`detectAnomalies(transactions, opts)`.

## 4. Public API

```js
const {
  detectAnomalies,          // master pipeline
  analyzeAgainstBenford,    // Benford chi^2
  findDuplicates,           // raw duplicate pairs
  computeZScore,            // single-value z-score
  movingAverageAnomaly,     // generic series analyser
} = require('./src/ml/anomaly-detector');
```

### Record shape

Every anomaly produced has the documented shape:

```js
{
  transaction_id: 'tx-001',
  anomaly_type:   'zscore',    // zscore | iqr | moving_average |
                                // seasonal | benford | duplicate |
                                // round_amount | time_of_day |
                                // velocity | geographic
  severity:       8,            // integer 1..10
  explanation_he: 'סכום חריג פי 12 מהממוצע של ACME',
  explanation_en: 'Amount 12x higher than average for ACME',
  confidence:     0.87,         // 0..1
  metric:         { z: 11.3, mean: 1000, stdev: 37, amount: 12000 }
}
```

## 5. Test Suite

**Location:** `onyx-procurement/test/payroll/anomaly-detector.test.js`
**Runner:** `node --test` (built-in)
**Cases:** 34 tests across 10 detectors and all helper utilities.

### Breakdown

1. `mean / variance / stdev basic`
2. `median and quartile`
3. `computeZScore — clear outlier`
4. `computeZScore — inlier returns small magnitude`
5. `computeZScore — zero stdev safe`
6. `movingAverageAnomaly flags the spike`
7. `movingAverageAnomaly — no spike, no output`
8. `detectZScore flags a 10x outlier in vendor history`
9. `detectIQR flags out-of-range amount`
10. `detectMovingAverage flags late-dataset spike`
11. `detectSeasonal flags off-pattern monthly transaction`
12. `analyzeAgainstBenford conforms on Benford-distributed set`
13. `analyzeAgainstBenford flags uniform distribution`
14. `analyzeAgainstBenford returns safe result on tiny sample`
15. `firstSignificantDigit`
16. `findDuplicates — exact duplicate 2 days apart`
17. `findDuplicates — fuzzy vendor match`
18. `findDuplicates — ignores >7 days apart`
19. `detectDuplicates emits Hebrew + English explanation`
20. `isRoundAmount and detectRoundAmounts`
21. `detectTimeOfDay flags 03:00 transactions`
22. `detectVelocity flags burst of 6 tx in 5 minutes`
23. `detectGeographic flags impossible travel`
24. `haversineKm Tel Aviv to Jerusalem ~55km`
25. `levenshtein and vendorSimilarity`
26. `normalizeVendor strips punctuation and lowercases`
27. `clampSeverity bounds to 1..10`
28. `detectAnomalies returns [] for empty input`
29. `detectAnomalies returns [] for single clean transaction`
30. `detectAnomalies mixed scenario covers multiple anomaly types`
31. `every detection conforms to the documented record shape`
32. `detectAnomalies is deterministic across runs`
33. `detectZScore ignores vendors with tiny history`
34. `detectBenford produces explanations when chi-square fails`

### Run result

```
ℹ tests 34
ℹ pass  34
ℹ fail  0
ℹ duration_ms ~186
```

Reproduce:

```
cd onyx-procurement
node --test test/payroll/anomaly-detector.test.js
```

## 6. Design Notes

- **Seasonal detector uses leave-one-out.** A naive monthly mean would let
  the outlier pollute its own baseline; we remove the candidate tx from
  both the month bucket and the global bucket before computing the ratio,
  and use the median instead of the mean for robustness.
- **Time-of-day detector requires an explicit `timestamp` field.** Bare
  date strings (`yyyy-mm-dd`) parse to midnight UTC and would otherwise
  generate spurious 00:00 alerts for every transaction.
- **Z-score severity is blended with the ratio-to-mean.** A huge single
  outlier inflates its own sample stdev, masking the z-score. The engine
  combines `|z|` with `log2(ratio)` so 10x-of-mean outliers always land in
  the upper severity band.
- **Benford analysis applies per vendor/category group.** Mixing
  categories (salaries, rent, petty cash) would destroy the Benford
  distribution at the global level.
- **Duplicate detector is O(n^2) worst case but O(n log n) in practice**
  because it sorts by date and breaks the inner loop as soon as the date
  gap exceeds `duplicateWindowDays`.
- **No floating-point surprises.** Money comparisons use an explicit
  `duplicateAmountEps` (default 0.01 NIS) rather than `===`.
- **Deterministic.** No `Math.random()`, no wall-clock reads, no locale
  reads. The same input always produces the same anomalies in the same
  order (sorted by severity desc, then confidence).

## 7. Constraints Observed

- **Zero runtime deps.** Only `node:test` and `node:assert/strict` for
  tests, both built-in.
- **Never delete.** No existing files removed or renamed.
- **Pure math.** No `require()` beyond built-ins; no side effects.
- **Hebrew + English.** Every detector emits both languages.

## 8. Known Limitations / Future Work

- Geographic detector assumes `lat`, `lon` floats and `user_id` /
  `account_id` for actor grouping. Missing-geo transactions silently skip.
- Seasonal detector covers monthly seasonality only; weekly and quarterly
  patterns are not decomposed.
- Benford chi-square uses 8 degrees of freedom; for very large samples a
  Mantissa-Arc test would be more sensitive but adds complexity not
  justified for procurement volumes.
- Velocity detector only groups by vendor; adding per-user / per-device
  grouping would catch account-takeover fraud patterns.

## 9. Sign-off

- All 34 tests green.
- No mutation of input arrays, verified via the determinism test.
- Ready for integration into the invoice ingestion pipeline
  (`src/imports/csv-import.js`) and the bank reconciliation path
  (`src/bank/multi-format-parser.js`).
