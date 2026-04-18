# QA Report — AG-X04 Predictive Cash-Flow Analytics

**Agent:** X-04 (Swarm 3)
**System:** Techno-Kol Uzi ERP — Kobi EL mega-ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 26 / 26 unit tests passing (zero dependencies)

## Deliverables

| File | Path | Purpose |
| --- | --- | --- |
| `cash-flow-predictor.js` | `onyx-procurement/src/analytics/cash-flow-predictor.js` | Probabilistic 30/60/90-day cash-flow predictor (Monte Carlo + seasonal) |
| `cash-flow-predictor.test.js` | `onyx-procurement/test/payroll/cash-flow-predictor.test.js` | 26 synthetic-data unit tests covering full public API + internals |
| `AG-X04-cash-flow-predictor.md` | `onyx-procurement/_qa-reports/AG-X04-cash-flow-predictor.md` | This QA report |

## Scope

Predictive, probabilistic cash-flow analytics module. Complements the
existing deterministic `src/reports/cash-flow-forecast.js` (Agent 63) by
adding:

- Monte Carlo simulation (configurable, default 1000 iterations) with
  reproducible `mulberry32` PRNG + Box–Muller normal sampling
- Seasonal index (day-of-week, day-of-month, month-of-year) built from
  up-to-365 days of historical cash-movement data
- Client payment-history weighted AR timing (uses per-client
  `avg_days_to_pay` / `std_dev_days` / `default_risk`)
- Israeli-specific outflow scheduling (payroll 25th, NI/tax 15th, VAT
  bi-monthly) with weekend shifting
- Jewish-holiday dampening (פסח, שבועות, ראש השנה, יום כיפור, סוכות)
- End-of-quarter "collection push" (last 5 business days of Q1/Q2/Q3/Q4)
- Back-testing (MAPE, RMSE, P10–P90 coverage) against historical daily
  balances

Module is **read-only** — does not delete, mutate, or persist any data.
Bilingual Hebrew/English labels throughout.

## Public API

| Export | Signature | Notes |
| --- | --- | --- |
| `predictCashFlow(opts)` | opts → `{ daily_forecast, alerts, confidence_bands, assumptions, backtest, summary, seasonal_index, generated_at }` | Main entry point. 30/60/90 horizons always present. |
| `estimateClientPaymentDate(invoice, clientHistory)` | → `{ expected_date, p10_date, p50_date, p90_date, confidence, avg_days_to_pay, std_dev_days, default_risk, n_samples, source }` | Uses history when available, falls back to `due_date` or defaults |
| `identifyLiquidityRisk(forecast)` | → `alert[]` | CRITICAL / HIGH / MEDIUM severity based on p10 + prob_negative |
| `backtestModel(historical)` | → `{ mape, rmse, n_points, skipped, coverage_p10_p90, total_rows, note? }` | Rolling-origin back-test of seasonal baseline |
| `_internals` | helpers | Exposed for unit tests / advanced callers |

### Algorithm

1. **Aggregate historical daily cash movements** (last 365 days) via
   `buildSeasonalIndex` which averages net flow by DoW, DoM, MoY.
2. **Build seasonal index** with `SEASONAL_BLEND_ALPHA = 0.6` (DoW
   weighted stronger than DoM / MoY). Ratios capped to [0.3, 2.5] to
   avoid runaway amplification.
3. **Compute expected AR inflow** per invoice: mean day-to-pay pulled
   from `clientHistory`, fallback to `DEFAULT_AVG_DAYS_TO_PAY = 30`.
4. **Generate deterministic outflows**:
   - Payroll: 25th of each month (shifted forward to next business day
     if weekend).
   - NI + Income Tax: 15th of each month.
   - VAT: 15th of every bi-monthly even month (Feb/Apr/Jun/Aug/Oct/Dec).
   - Recurring expenses (weekly/biweekly/monthly/quarterly/yearly).
   - Explicit `scheduledBills`.
5. **Monte Carlo loop** (default 1000 iterations): for each invoice,
   sample `N(mean_day, std_dev_days)`, apply EOQ push and holiday
   dampening, shift weekends, clamp to horizon. Compute running balance
   per iteration.
6. **Percentile extraction**: for each day, sort the iteration column
   and pick `P10`, `P50`, `P90`, plus `prob_negative` (fraction of
   simulations below zero).
7. **Flag liquidity risk days** via `identifyLiquidityRisk`.

### Alert thresholds

| Severity | Trigger |
| --- | --- |
| CRITICAL | `p10 < 0` AND `prob_negative ≥ 0.5` |
| HIGH | `p10 < 0` AND `prob_negative ≥ 0.25`, or `p50 < 0` |
| MEDIUM | `p10 < 0` AND `prob_negative ≥ 0.10` |

## Israeli Timing Constants

| Constant | Value | Rationale |
| --- | --- | --- |
| `ISRAELI_PAYROLL_DAY` | 25 | חוק הגנת השכר — משכורת עד ה-10 לחודש העוקב, כאן הנחה שמתשלמים ב-25 |
| `ISRAELI_NI_TAX_DAY` | 15 | ביטוח לאומי + מס הכנסה — דיווח חודשי |
| `ISRAELI_VAT_DAY` | 15 | מע״מ — דיווח דו־חודשי (חודשים זוגיים) |
| `HOLIDAY_DAMPEN_FACTOR` | 0.4 | 40% of expected inflow lands in holiday window |
| `EOQ_PUSH_DAYS_EARLY` | 3 | Invoices due last 5 business days of Q shift 3 days earlier |

### Jewish Holiday Windows (Gregorian approximation)

Hard-coded for 2025, 2026, 2027. Includes Pesach (פסח), Shavuot (שבועות),
Rosh Hashana (ראש השנה), Yom Kippur (יום כיפור), Sukkot (סוכות). Each
window is widened by ±2 days for "friction" (the days just before and
after a holiday also see reduced collection activity).

## Unit Tests (26 passing, target ≥15)

| # | Test | Validates |
| --- | --- | --- |
| 1 | exports | public API surface present |
| 2 | empty inputs | returns full 30/60/90 structure |
| 3 | deterministic seed | same seed → identical output |
| 4 | horizons | day_offset strictly increasing |
| 5 | opening balance | flows through when no events |
| 6 | payroll 25th | generateIsraeliOutflows produces 25th (weekend-shifted) |
| 7 | NI/VAT schedule | 15th monthly + bi-monthly even-month VAT |
| 8 | negative-balance alerts | CRITICAL/HIGH triggered on insolvency |
| 9 | estimateClientPaymentDate history | uses avg_days_to_pay from history |
| 10 | estimateClientPaymentDate default | fallback when no history |
| 11 | sparse history | `low_sample` source + due_date fallback |
| 12 | rich history | confidence ≥ 0.8 when n=100, low CV |
| 13 | identifyLiquidityRisk CRITICAL | p10<0 ∧ prob≥0.5 |
| 14 | identifyLiquidityRisk HIGH | 0.25 ≤ prob < 0.5 |
| 15 | backtestModel MAPE/RMSE | 60 synthetic days |
| 16 | backtestModel small | null when < 14 rows |
| 17 | seasonal_index populated | DoW[7], DoM[32], MoY[12] |
| 18 | Pesach 2026 detection | holidayForDate recognises window |
| 19 | end-of-quarter window | last 5 days of Q2 flagged |
| 20 | Monte Carlo invariant | P10 ≤ P50 ≤ P90 every day |
| 21 | default_risk = 1.0 | zero inflow from that client |
| 22 | scheduledBills | AP outflow on due_date |
| 23 | mulberry32 determinism | same seed identical + mean≈0.5 |
| 24 | randn N(0,1) | mean≈0, variance≈1 on 5000 samples |
| 25 | isBusinessDay | Sun-Thu=true, Fri-Sat=false |
| 26 | DoW seasonal pattern | Sunday factor ≥ other days when Sundays higher |

Run: `node --test test/payroll/cash-flow-predictor.test.js`

## Smoke Test Results

```
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 265.28
```

## Compliance

| Rule | Status |
| --- | --- |
| Never delete | PASS — module is pure function, no writes |
| Hebrew bilingual | PASS — all labels bilingual via `LABELS` constant |
| Zero dependencies | PASS — only `node:test`, `node:assert`, `path` (core) |
| Real math | PASS — `mulberry32` PRNG, Box–Muller normal, rolling back-test MAPE/RMSE |
| Deterministic | PASS — test #3 + #23 verify |
| 15+ test cases | PASS — 26 tests |

## Known Limitations

- Jewish holidays are hard-coded for 2025-2027 (Gregorian approximation,
  no Hebrew-date conversion). Extending to later years requires adding
  entries to `JEWISH_HOLIDAY_WINDOWS`.
- Back-test only evaluates the **seasonal baseline**, not the full Monte
  Carlo layer (would require historical AR/AP snapshots).
- Normal distribution is assumed for payment timing — real-world client
  payment distributions are right-skewed. A log-normal option could be
  added later without changing the public API.

## Integration Notes

- The existing deterministic `src/reports/cash-flow-forecast.js` is
  untouched and remains the canonical "hard numbers" forecast.
- This predictor is designed to be called alongside it; the UI layer can
  render both the deterministic P50 line and the Monte Carlo P10/P90 band.
- The `backtest` field in the output enables a "model health" badge in
  the dashboard (green if MAPE < 0.15, yellow 0.15-0.30, red > 0.30).

## Files Created

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\analytics\cash-flow-predictor.js` (~870 lines, zero deps)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\payroll\cash-flow-predictor.test.js` (26 tests)
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\_qa-reports\AG-X04-cash-flow-predictor.md` (this report)
