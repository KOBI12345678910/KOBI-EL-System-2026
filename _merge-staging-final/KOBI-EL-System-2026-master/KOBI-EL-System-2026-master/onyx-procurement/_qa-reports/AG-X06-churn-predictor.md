# AG-X06 — Client Churn Predictor

**Agent:** X-06 (Swarm 3)
**Date:** 2026-04-11
**Scope:** `onyx-procurement/src/analytics/`, `onyx-procurement/test/payroll/`
**Project:** Techno-Kol Uzi ERP — Kobi's Mega-ERP
**Rule:** לעולם לא מוחקים · zero dependencies · Hebrew bilingual

---

## Mission

Build a zero-dependency, deterministic predictor that identifies clients at
risk of leaving Techno-Kol Uzi, combining ten behavioural signals into a
0..100 composite risk score and a bilingual retention report. Module must be
pure JavaScript, safe for worker / CLI / report embedding, and must never
mutate or delete customer data.

---

## Deliverables

| # | Path | Lines | Purpose |
|---|---|---|---|
| 1 | `onyx-procurement/src/analytics/churn-predictor.js` | 670 | Core predictor, LTV/CAC helpers, Hebrew retention report |
| 2 | `onyx-procurement/test/payroll/churn-predictor.test.js` | 530 | `node:test` suite, 50 cases |
| 3 | `onyx-procurement/_qa-reports/AG-X06-churn-predictor.md` | this file | QA summary |

---

## Module Design

### Public API

```js
const {
  predictChurn,          // (clientId, history) → prediction
  rankAllClients,        // (clients, opts) → sorted array
  generateRetentionReport, // (clients, opts) → Hebrew string
  suggestAction,         // (client) → string[]
  computeLtv,            // (history, opts) → { total, monthly_avg, years }
  computeCacToLtvRatio,  // (client, opts) → { cac, ltv, ratio, quality, quality_he }
  classify,              // (score) → 'healthy' | 'watch' | 'at_risk' | 'critical'
  WEIGHTS,               // frozen signal weight table
  CLASSIFICATION_THRESHOLDS, // frozen bucket boundaries
  SIGNAL_LABELS,         // frozen { he, en } labels
  __internal__,          // testing hooks (pure helpers)
} = require('./src/analytics/churn-predictor.js');
```

### Signals (10 total, weighted composite)

| Key | Weight | Extractor | Description |
|---|---|---|---|
| `frequency_drop` | 0.18 | `signalFrequencyDrop` | Invoices/day in last 90d vs 365d baseline |
| `amount_drop` | 0.14 | `signalAmountDrop` | Mean invoice amount drop, recent vs baseline |
| `order_gap` | 0.13 | `signalOrderGap` | Avg gap of last 3 orders vs overall |
| `late_payments` | 0.12 | `signalLatePayments` | Rate of late invoices, recent vs baseline |
| `disputes` | 0.10 | `signalDisputes` | Payment disputes raised in last 180d (2× if unresolved) |
| `support_tickets` | 0.08 | `signalSupportTickets` | Severity-weighted complaint tickets |
| `cancelled_quotes` | 0.07 | `signalCancelledQuotes` | Cancelled quotes without conversion |
| `info_changes` | 0.06 | `signalInfoChanges` | Billing / shipping / bank account changes |
| `contact_drop` | 0.07 | `signalContactDrop` | Contact events last 90d vs prior 90d |
| `seasonal_adjust` | 0.05 | `applySeasonalDamping` | Dampens score for known seasonal buyers |

All signals are clamped to `[0..100]` before weighting. Weights are
pre-normalised to the non-seasonal slice so the composite always projects
to `[0..100]`.

### Classification buckets (per spec)

| Bucket | Range | Hebrew |
|---|---|---|
| `healthy`  | 0..30   | בריא |
| `watch`    | 31..60  | במעקב |
| `at_risk`  | 61..80  | בסיכון |
| `critical` | 81..100 | קריטי |

### Seasonal adjustment

The predictor will not false-alarm known seasonal buyers. Two modes:

1. **Explicit metadata:** `history.seasonal = true` plus `quiet_months: [n]`
   applies 0.5× damping when the reference date falls in a quiet month.
2. **Auto-detection:** with ≥12 invoices over ≥2 years, a
   coefficient-of-variation test (`cv ≥ 0.6` and current month ≤ 40% of mean)
   applies softer 0.7× damping.

Clients with `seasonal = false` are never auto-damped.

### LTV / CAC helpers

* `computeLtv(history, opts)` → `{ total, monthly_avg, years }` — span from
  first invoice to reference date.
* `computeCacToLtvRatio(client, opts)` → `{ cac, ltv, ratio, quality,
  quality_he }`, quality buckets:
  * `ratio >= 5`  → `excellent` / מצוין
  * `3 ≤ ratio`  → `healthy` / בריא
  * `1 ≤ ratio`  → `marginal` / גבולי
  * `ratio < 1`  → `loss` / הפסדי
  * `cac = 0`    → `unknown` / לא ידוע (no division by zero)

### Retention report

`generateRetentionReport` returns a plain-text, Hebrew-primary, bilingual
string with a 72-column frame, bucket summary, a top-N risk table, per-row
suggested actions, and a footer reminding readers that the ERP never deletes
(`לעולם לא מוחקים`).

### Suggested actions (Hebrew)

The `suggestAction` helper adds baseline messages per bucket plus contextual
add-ons driven by the dominant signals. Example output for a critical
client with dispute + late-payment dominance:

```
פגישה אישית מיידית עם מנהל הלקוחות
הצעה להנחה 10% + תנאי תשלום משופרים
מעבר אישי של תיק הלקוח להנהלה
תזמון ועדת שימור
טיפול מיידי במחלוקות פתוחות
בירור גמישות בתנאי תשלום
```

Deduplication preserves insertion order so the UI can render the list as-is.

---

## Determinism & "לא מוחקים" guarantees

* No `Math.random()`, no `Date.now()` unless the caller omitted
  `reference_date`. Tests pin `reference_date` to `2026-04-11T00:00:00Z`,
  guaranteeing reproducible scores.
* `rankAllClients` returns a **new array** — input is never mutated. The
  `rankAllClients: does not mutate input array` test pins this contract.
* The predictor only reads from its argument. There is no write path,
  no database call, no file I/O.
* Failure modes are soft: malformed entries are skipped, `null` history is
  handled, `risk_score` is always in `[0..100]`.

---

## Test Results

```
✔ node --test test/payroll/churn-predictor.test.js

ℹ tests    50
ℹ pass     50
ℹ fail      0
ℹ duration  ~180 ms
```

### Coverage by area

| Area | Cases |
|---|---|
| `classify` boundaries + clamping | 11 |
| `predictChurn` shape & behaviour | 7 |
| Individual signal extractors | 9 |
| Seasonal damping (explicit + non-seasonal) | 2 |
| `suggestAction` (Hebrew, critical, dedupe, null) | 4 |
| `rankAllClients` (sort, mutation, empty) | 3 |
| `generateRetentionReport` (bilingual, footer rule) | 2 |
| `computeLtv` (sum, empty, bad data) | 3 |
| `computeCacToLtvRatio` (healthy/excellent/loss/cac=0) | 4 |
| Label contract (every key has HE + EN) | 1 |
| Weight table sanity | 1 |
| Robustness (null history, malformed rows, score range) | 3 |
| **Total** | **50** |

Task asked for "15+" — delivered 50.

### Key fixtures

* `makeHealthyHistory()` — 52 weekly invoices of ₪5,000, on-time, regular
  contacts. Returns `risk_score ≤ 30`, `classification = healthy`.
* `makeCriticalHistory()` — declining invoice cadence, 85% amount drop,
  rising late payments, 2 unresolved disputes, 3 severe tickets,
  3 cancelled quotes, recent bank-account change, contact silence.
  Classified `at_risk` or `critical`.

### Deterministic fixture check

`predictChurn: deterministic — same input twice yields identical score`
runs the critical fixture twice and asserts `risk_score` and `classification`
are identical, confirming no hidden randomness.

---

## Rule Compliance

| Rule | Status | How |
|---|---|---|
| **Never delete** | passed | Module is read-only; `rankAllClients` returns new array; no DB/file writes |
| **Hebrew bilingual** | passed | Every `SIGNAL_LABELS[key]` has `he` + `en`; report has both; all suggestion strings are Hebrew; test asserts `/[\u0590-\u05FF]/` coverage |
| **Zero dependencies** | passed | Only `node:test` + `node:assert` + `path` (all built-ins); no `require` of anything outside the module itself |
| **Real code** | passed | 50 live tests, deterministic fixtures, no stubs |

---

## File Paths (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\analytics\churn-predictor.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\payroll\churn-predictor.test.js`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\_qa-reports\AG-X06-churn-predictor.md`

---

## Follow-ups (optional, non-blocking)

1. **CRM integration:** wire `rankAllClients` into the existing
   `reports/` cron so the Hebrew report emails out every Sunday morning.
2. **Supabase contract:** add a `src/analytics/churn-supabase.js` adapter
   that reads invoices/orders/tickets/quotes/contacts from Supabase and
   shapes them into the `history` object this module expects. Keep the
   adapter separate so the core predictor stays dependency-free.
3. **Per-tenant weights:** allow `predictChurn(clientId, history, { weights })`
   so different verticals (B2B wholesale vs retail) can tune signal weights.
   Current design already accepts an opts path — just widen the type.
4. **Backtesting:** once we have a churn ground-truth dataset, add a harness
   in `test/payroll/churn-predictor.backtest.js` that replays real history
   and measures precision/recall at each classification boundary.

None of these are required for the current task.

---

**Status:** complete. 50/50 tests pass. Zero deps. Hebrew-bilingual.
