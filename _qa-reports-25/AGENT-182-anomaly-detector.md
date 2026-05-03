# AGENT-182 — Deep Audit: Anomaly Detector (AG-100)

**Auditor:** Agent 182
**Date:** 2026-04-29
**Subject:** `onyx-procurement/src/ml/anomaly-detector.js`
**Source report audited:** `_qa-reports/AG-100-anomaly-detector.md`
**Verdict:** GREEN on engine (34/34 tests pass) — YELLOW on integration claim

---

## 1. Verification Run

```
node --test test/payroll/anomaly-detector.test.js
ℹ tests 34   ℹ pass 34   ℹ fail 0   duration ~2.4s
```

Re-ran the suite live. AG-100's claim of 34/34 green is reproducible. Engine is a single
840-line file, 0 runtime deps, exports 27 symbols (5 public + 22 internals for white-box tests).

---

## 2. Algorithms — Per-Detector Audit

| # | Method | Lines | Group | Min N | Severity formula |
|---|---|---|---|---|---|
| 1 | Z-score (sample stdev) | 403–433 | vendor+category | 4 | `max(\|z\|, 3 + 2·log2(ratio))` |
| 2 | IQR Tukey 1.5x | 435–465 | vendor+category | 5 | `1 + (dist/IQR)·2` |
| 3 | Moving avg 30/90/365 | 467–498 | vendor+category | window+1 | `1 + amount/movingAvg` |
| 4 | Seasonal (monthly LOO median) | 500–562 | vendor+category | 12 | `\|log2(ratio)\|·2` |
| 5 | Benford chi-square | 564–594 | vendor+category | 30 | `2 + chi/10` |
| 6 | Fuzzy duplicate | 596–619 | pair-wise | 2 | `5 + (1-days/7)·5` |
| 7 | Round-amount ratio | 621–642 | vendor | 5 | `2 + pct·8` |
| 8 | Time-of-day | 644–666 | per-tx | 1 | `3 + hour-distance` |
| 9 | Velocity sliding window | 668–710 | vendor | 5 | `min(10, count)` |
| 10 | Geographic haversine | 712–759 | actor (user/account/vendor) | 2 with geo | `3 + log10(speed/limit)·3` |

### Algorithmic notes
- **Z-score blends ratio** (line 418–419): a single 10× outlier inflates its own stdev,
  shrinking |z|. Engine compensates with `log2(ratio)·2` so 10× still lands in upper severity
  band. Sound and verified by test 30.
- **Seasonal uses leave-one-out median** (lines 525–537): removes the candidate from both the
  month bucket and the global bucket before ratio. Median over mean = robust to single
  outliers. Best-engineered detector in the file.
- **Benford suspicious_digits gating** (line 576): only emits anomalies for tx whose leading
  digit is in the >3·SE list — prevents flagging the entire group when only digits 6–9 spike.
- **Duplicate inner-loop early break** (line 358): `if (gap > windowDays) break` after sorting
  by date — turns nominal O(n²) into O(n·k) where k = avg duplicates per 7-day window.
- **Time-of-day skips bare date strings** (lines 650–652): without an explicit `timestamp`
  field, `'2026-04-11'` parses to 00:00 UTC and would flag every tx. Explicit guard prevents
  false positives. Caveat: uses `getUTCHours()` — Israel is UTC+2/+3, so a 23:00 IL tx
  (21:00 UTC) is not flagged, and a 02:00 UTC tx is flagged regardless of local time.
  Localization for IL business hours is **missing**.
- **Velocity skip-past-burst** (line 705): `i = j - 1` after a burst — prevents N overlapping
  flags for the same window of N+1 tx. Correct.

---

## 3. Thresholds (DEFAULTS, lines 60–76)

| Threshold | Value | Assessment |
|---|---|---|
| `zScoreThreshold` | 3.0 | Standard — matches 99.7% rule. |
| `iqrK` | 1.5 | Tukey canonical. |
| `movingWindows` | [30,90,365] | Reasonable. 365 needs >365 tx/group — rare for procurement. |
| `movingThreshold` | 3.0 | Same as z-score — consistent. |
| `benfordMinSamples` | 30 | Conservative. Real Benford lit recommends ≥80–100. **Risk: false positives on small samples that just happen to clear 30.** |
| `benfordChiCritical` | 15.507 | Correct: chi² 8 dof, p=0.05. |
| `duplicateWindowDays` | 7 | Sensible for invoice double-pay. |
| `duplicateAmountEps` | 0.01 NIS | Floating-point safe (line 359 uses `Math.abs(...)>eps`). |
| `duplicateVendorSim` | 0.85 | Strict — Levenshtein-normalized; "ACME Ltd" vs "ACME LTD." matches; "ACME" vs "ACMA" likely doesn't. |
| `roundSuspicionMinPct` | 0.20 | High base rate in legit small-business — **expected source of false positives**. |
| `timeOfDay` 06–22 | 06,22 UTC | Hard-coded UTC, see §2 caveat. |
| `velocityMaxTxInWindow` | 5 in 5 min | Per-vendor only, not per-user/device — see §6. |
| `geoMaxKmPerHour` | 900 | Faster than commercial jet. Correct rationale. |

All overridable per call (line 782, `Object.assign({}, DEFAULTS, opts)`).

---

## 4. False-Positive Risk Profile

The report does NOT publish an empirical false-positive rate. From code review:

| Detector | FP risk | Driver |
|---|---|---|
| Z-score | Low–Med | 4-tx min history is too low; 1 outlier in 4 inflates stdev erratically. Should be ≥10. |
| IQR | Low | 5-tx min, well-bounded. |
| Moving avg | Low | Requires `series.length > window`. |
| Seasonal | Low | LOO + median = robust. |
| Benford | **Med–High** | `benfordMinSamples=30` too small; Hebrew small-vendor sets often violate Benford for legitimate reasons (rounded prices, tax-inclusive amounts). Tag-by-suspicious-digit narrows blast radius. |
| Duplicate | Low | Strict 0.85 sim + 0.01 NIS eps + 7-day window. |
| Round amounts | **High** | 20% threshold + flagging *every* round tx in vendor group — IL vendors quoting ex-VAT round amounts (1000, 2000, 5000) trip this constantly. |
| Time-of-day | **Med** | UTC-only; misses IL business hours; bare-date guard prevents the worst case. |
| Velocity | Low | 5-in-5-min is rare for a single vendor in legit ERP traffic. |
| Geographic | Low | 900 km/h ceiling; only fires on flagrant impossibilities. |

**No automated FP self-test.** The test suite verifies each detector emits on a planted
positive and stays silent on a clean dataset. There is no large-sample benign-traffic test
that would surface real FP rate. **Recommendation:** add a "10k synthetic-clean tx"
regression that asserts < N anomalies/1000 per detector.

---

## 5. Determinism & Purity

- No `Math.random()`, no `Date.now()`, no `process.env` reads — confirmed by file grep.
- No mutation of input array (test 32 verifies determinism across runs; sort uses `.slice()`
  before sort — line 113, 347, 472, 673, 725).
- Final sort by `severity desc, confidence desc` (line 795–798) is the determinism anchor.
- **Edge case:** `detectSeasonal` uses `indexOf(amount)` to remove self from buckets
  (line 526, 532). If two tx in same group have *identical* amounts, this removes the wrong
  one. Result is still deterministic but technically incorrect for tied amounts. Low impact.

---

## 6. Alerts / Integration — **The Gap**

The AG-100 report's §9 "Sign-off" claims:
> Ready for integration into the invoice ingestion pipeline (`src/imports/csv-import.js`)
> and the bank reconciliation path (`src/bank/multi-format-parser.js`).

**Audit finding:** Neither file imports or calls the detector.

```
grep "anomaly" src/imports/csv-import.js     => 0 matches
grep "anomaly" src/bank/multi-format-parser.js => 0 matches
grep "detectAnomalies\|anomaly-detector" src/ => only the engine + its test
```

Engine emits anomaly records but has **zero hooks** into:
- Notification/event bus (no `emit`, no `bus`, no `webhook` in source).
- HTTP routes (no Express handler exposes `detectAnomalies`).
- Persistence (no DB write of anomaly records).

**UI consumer exists but is wired to a different pipeline.** `erp-app/src/pages/finance/payment-anomalies.tsx` subscribes to SSE events `payment_anomaly_critical` /
`payment_anomaly_new` and consumes records with `anomaly_type` field — same shape as this
detector emits — but the producer of those SSE events is **not** this JS engine. The
detector's output is not connected to the UI.

There is also a separate Python detector at `enterprise_palantir_core/app/engines/anomaly_detection.py` (different stack, not audited here).

### Severity of integration gap
- Engine works as a library.
- Caller code that would invoke it on incoming CSV/bank rows and route to SSE/notifications
  **has not been written**. AG-100's sign-off statement is aspirational, not factual.

---

## 7. Issues Found

| ID | Severity | Item |
|---|---|---|
| A182-1 | High | No call site. Engine is dead code from a runtime perspective. AG-100 sign-off is incorrect. |
| A182-2 | Med | `benfordMinSamples=30` too low; raise to ≥80 to stabilize chi². |
| A182-3 | Med | `detectZScore` min history 4 is too small; 10 recommended. |
| A182-4 | Med | Time-of-day uses UTC; should accept timezone option (default `Asia/Jerusalem`). |
| A182-5 | Med | Round-amount detector flags every round tx in flagged group — likely high FP rate against IL ex-VAT pricing. Add allowlist or per-category exemption. |
| A182-6 | Low | `detectSeasonal` self-removal by `indexOf(amount)` is wrong on tied amounts. Use index-based exclusion. |
| A182-7 | Low | Velocity groups only by vendor; report §8 already lists this as future work. |
| A182-8 | Low | No empirical FP-rate regression test. |

---

## 8. Conclusion

The engine itself is well-built: 10 complementary detectors, sound math, robust to single
outliers (LOO seasonal, ratio-blended z-score), deterministic, zero deps, bilingual
explanations, 34/34 tests green. Code quality is high.

The **integration claim in AG-100 §9 is false** — the detector has no production caller in
`onyx-procurement`. Until a wiring layer (CSV/bank import hook + event-bus emit + SSE
publish) is added, this is a library, not an active fraud-detection system. The UI page that
would render its output is consuming events from a different (unidentified) producer.

**Recommended next agent task:** wire `detectAnomalies` into `csv-import.js` post-parse,
publish records via the existing notification SSE channel under `payment_anomaly_new`, and
persist to a `payment_anomalies` table.

### Files referenced
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\ml\anomaly-detector.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\test\payroll\anomaly-detector.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_qa-reports\AG-100-anomaly-detector.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\erp-app\src\pages\finance\payment-anomalies.tsx`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\imports\csv-import.js` (no integration)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\bank\multi-format-parser.js` (no integration)
