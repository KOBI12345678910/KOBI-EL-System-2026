# Cash Flow Forecast — Methodology

Module: `src/reports/cash-flow-forecast.js`
Tests: `src/reports/cash-flow-forecast.test.js`
Agent: 63
Date: 2026-04-11

This document explains how the cash-flow forecast is built, what it covers,
what it deliberately does NOT cover, and how to read its output.

---

## 1. Purpose

Answer one question with numbers instead of guesswork:

> "Given what we know today, how much cash will we have on each of the next
> N days, and when is the dangerous moment?"

The forecast is **deterministic** — given the same inputs, it always
produces the same output. It is not a Monte-Carlo simulation. Scenarios
are produced by applying known scale factors to AR and AP streams.

---

## 2. Inputs

All inputs are read from Supabase (read-only). Missing tables degrade
gracefully — the forecast still runs, it just loses a signal.

| Table | Fields used | Meaning |
|---|---|---|
| `bank_accounts` | `balance`, `is_active`, `currency` | Opening balance (sum of active accounts) |
| `ar_invoices` | `amount`, `expected_pay_date`, `invoice_date`, `status` | Expected customer inflows |
| `ap_invoices` | `amount`, `due_date`, `status` | Scheduled vendor outflows |
| `recurring_obligations` | `amount`, `kind`, `day_of_month` or `next_date`, `frequency`, `active` | Payroll, rent, utilities, etc. |
| `purchase_orders` | `amount_total`, `expected_payment_date`, `status` | Committed spend from open POs |
| `tax_obligations` | `amount`, `kind`, `due_date`, `period` | Monthly VAT, annual tax, Bituach Leumi |

Notes:

- **Status filtering.** AR/AP/PO rows with status `paid`, `void`,
  `cancelled`, or `closed` (POs) are excluded.
- **Duck typing.** Each loader uses `safeSelect`, which catches errors
  from missing tables/columns. A broken or absent table reduces to an
  empty array, not a crash.

---

## 3. Recurrence expansion

`expandRecurring(obligation, start, end)` walks the horizon and emits
one outflow event per occurrence. Supported frequencies:

- `monthly` (default) — advances `month + 1`, preserving day of month.
- `weekly` — advances 7 days.
- `biweekly` — advances 14 days.
- `quarterly` — advances `month + 3`.
- `annual` / `yearly` — advances `year + 1`.

Starting cursor: `next_date` if present, else the next occurrence of
`day_of_month` inside the horizon. Recurring rows without either field
are skipped.

Typical examples in Techno Kol:

- **Payroll** — monthly, `next_date` set by HR.
- **Office rent** — monthly, `day_of_month = 1`.
- **Monthly VAT** — modeled both through `tax_obligations` (specific
  month-by-month) AND through recurring (when the user has a fixed
  schedule). Whichever is present wins.
- **Bituach Leumi** — monthly recurring.

---

## 4. Forecast algorithm

1. **Load inputs in parallel** via `Promise.all`.
2. **Normalize** every event into a flat list:
   `{ date, amount, source, label, kind }` where inflows are positive
   and outflows are negative.
3. **Bucket** events into per-day entries. For each day:
   - `opening_balance` = previous day's closing balance (or initial on day 0)
   - `inflow` = sum of positive events on that day
   - `outflow` = absolute sum of negative events on that day
   - `net` = inflow - outflow
   - `closing_balance` = opening + net
4. **Scan** the day array to find:
   - `low_point` = minimum closing balance + its date
   - `first_negative_date` / `days_till_negative` (first closing < 0)

---

## 5. Scenarios

Three pre-built scenarios re-run the same event list with different
scale factors. This is cheap (no re-query) and keeps scenarios
comparable.

| Scenario | AR collection factor | AP payment factor | Meaning |
|---|---|---|---|
| `base` | 1.00 | 1.00 | The plan as submitted |
| `pessimistic` | 0.80 | 1.10 | Customers pay 20% less than promised, vendors demand 10% more on time |
| `optimistic` | 1.05 | 0.95 | Small collection upside, slight vendor flexibility |

Scenarios return `{ low_point, first_negative, final_balance, days }`.
Recurring payroll and tax outflows are NOT scaled — they are assumed
fixed-by-law commitments.

Invariant (verified in tests): for a positive opening balance,
`optimistic.final_balance >= base.final_balance >= pessimistic.final_balance`.

---

## 6. Confidence interval

The model returns a single `interval_pct` value plus a plain-language
reason. This is a heuristic, not a statistical CI. The formula:

```
interval_pct = BASE + DAY_DRIFT * horizonDays + STALE_AR * staleArCount
             = 0.05 + 0.004 * horizonDays + 0.02 * staleArCount
```

So:

- A 30-day forecast with no stale AR: `±5% + 12% = ±17%`.
- A 180-day forecast with 3 stale AR invoices: `±5% + 72% + 6% = ±83%`.

**Why the model is not certain** (listed in `confidence.reason`):

- Horizon drift — every extra day makes collection/payment timing less
  predictable.
- Stale AR — an invoice sitting unpaid for >60 days is less likely to
  be collected on its stated `expected_pay_date`.
- **Unmodeled surprises** — new customer invoices appearing mid-horizon,
  emergency repairs, a vendor demanding cash on delivery, equipment
  failures. These are explicitly NOT modeled.

Callers should treat `interval_pct` as: "the base-scenario number could
be off by this much, in either direction, before we even consider the
scenarios."

---

## 7. Alerts

Automatic alerts are emitted into `report.alerts`:

| Severity | Code | Condition |
|---|---|---|
| `CRITICAL` | `CASH_FLOW_NEGATIVE_LOW_POINT` | Base scenario's low point is `< 0` |
| `HIGH` | `CASH_FLOW_LOW_POINT_CLOSE` | Base low point is `>= 0` but happens within 30 days |
| `HIGH` | `CASH_FLOW_PESSIMISTIC_NEGATIVE` | Base stays positive but pessimistic goes negative |

Alerts include the projected amount, date, and day offset from `as_of`,
so downstream handlers (email, WhatsApp, dashboards) can include the
exact date in the message.

Callers are expected to forward `CRITICAL` alerts through the
incident-response channel immediately and `HIGH` alerts through
day-ahead finance reports.

---

## 8. Output shape

`forecastCashFlow()` returns:

```js
{
  generated_at: '2026-04-11T08:15:00.000Z',
  as_of: '2026-04-11',
  horizon_days: 90,
  horizon_end: '2026-07-09',
  opening_balance: 170000,
  final_balance: 82000,
  total_inflow: 250000,
  total_outflow: 338000,
  net_change: -88000,
  low_point: { amount: -12000, date: '2026-05-20', day_offset: 39 },
  first_negative_date: '2026-05-15',
  days_till_negative: 34,
  confidence: {
    interval_pct: 0.41,
    reason: 'baseline ±5%; +36% horizon drift (90d); unexpected invoices are NOT modeled',
    stale_ar_count: 0,
  },
  scenarios: {
    base:        { low_point, first_negative, final_balance, days[] },
    pessimistic: { ... },
    optimistic:  { ... },
  },
  alerts: [
    { severity: 'CRITICAL', code: 'CASH_FLOW_NEGATIVE_LOW_POINT', ... },
  ],
  inputs_summary: { bank_accounts, open_ar_count, open_ap_count, ... },
  banks: [ { id, name, balance, currency } ],
  days: [
    { date, day_offset, opening_balance, inflow, outflow, net, closing_balance, events: [...] },
    ...
  ],
}
```

---

## 9. Rendering

- **`renderCashFlowJson(data)`** — returns a plain JS object suitable
  for Express `res.json(...)`. It adds `event_count` per day and keeps
  the event array so clients can render per-day drill-downs.
- **`renderCashFlowPdf(data, outputPath)`** — writes a bilingual A4 PDF
  (Hebrew RTL labels + English) using `pdfkit`. Sections: summary, low
  point, confidence, scenarios, alerts, and a 30-day daily ledger.
  Returns `{ path, size }`. Writes its parent directory if missing.

---

## 10. What the forecast does NOT model

Be explicit about gaps so operators don't over-trust the number:

1. **FX** — all amounts are assumed in ILS. Multi-currency accounts are
   summed nominally.
2. **New business** — invoices created after `as_of` are unknown to the
   model.
3. **Partial payments** — AR and AP rows are treated as all-or-nothing.
4. **Credit lines / overdraft** — the model reports negative balances,
   it does not assume any bank overdraft is available.
5. **Interest & bank fees** — not included.
6. **Working-capital loans / factoring** — excluded.
7. **Seasonal swings** — customer seasonality is not extrapolated.

Any of these can be added as an additional event source later, using
the same `{ date, amount, source, label, kind }` contract.

---

## 11. Running the tests

```bash
cd onyx-procurement
node --test src/reports/cash-flow-forecast.test.js
```

Tests cover: bank aggregation, AR/AP/PO/tax event placement, recurring
expansion, low-point & first-negative detection, alert rules, scenario
ordering, confidence widening, graceful degradation on broken Supabase,
JSON rendering, and PDF file writing.
