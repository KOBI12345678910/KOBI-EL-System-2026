# AG-Y079 — Cash Flow Forecast (תזרים מזומנים — שיטה ישירה ועקיפה)

**Module**: `onyx-procurement/src/finance/cashflow-forecast.js`
**Tests**:  `onyx-procurement/test/finance/cashflow-forecast.test.js`
**Status**: Implemented — 28 / 28 tests passing (Node `--test`)
**Rule**: לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade/grow)
**Wave**: Y — Finance / Treasury
**Dependencies**: Zero external — pure Node built-ins only (`Buffer`, `Date`, `Math`)
**Bilingual**: Hebrew + English throughout (errors, API docs, PDF output, SVG title)
**Complementary to**: AG-X04 (Monte Carlo cash simulation) — X-04 is stochastic,
Y-079 is deterministic operational.

---

## 1. Purpose

Techno-Kol Uzi Mega-ERP treasury-grade cash forecast module with two
reconcilable views of cash:

1. **Direct method (שיטה ישירה)** — line-by-line receipts and disbursements,
   starting from opening cash, producing a period-level closing cash balance.
   Typically used for 13-week rolling short-term forecasts where treasury can
   stress-test customer receipts, supplier payment runs, payroll, and tax
   obligations at the line-item level.

2. **Indirect method (שיטה עקיפה)** — starts from net income (רווח נטו), adds
   back non-cash items (depreciation / פחת), adjusts for working-capital
   changes (AR / inventory / AP), then layers investing and financing flows.
   Used for quarterly and annual financial-statement forecasts and for
   reconciling the P&L to changes in cash.

Both views share the same append-only `forecasts` store. Stress scenarios,
actuals, and re-forecasts are stored as new snapshots linked to the base
forecast. Nothing is ever deleted.

The module is deliberately **deterministic**: no random sampling, no
distributions — that is the job of AG-X04. Y-079 produces the point estimate
that X-04 can perturb.

---

## 2. Public API

Exported from `src/finance/cashflow-forecast.js`:

| Export                  | Kind     | Purpose                                               |
| ----------------------- | -------- | ----------------------------------------------------- |
| `CashFlowForecast`      | class    | Main forecast engine                                  |
| `FORECAST_METHODS`      | enum     | `direct / indirect`                                   |
| `FORECAST_STATUS`       | enum     | `draft / published / rolled / superseded`             |
| `PERIOD_GRANULARITY`    | enum     | `daily / weekly / monthly / quarterly`                |
| `ISRAELI_PAYMENT_DAYS`  | consts   | Statutory payment dates — payroll, VAT, tax, pension  |
| `DEFAULT_ROLLING_WEEKS` | const    | `13`                                                  |

`require('…/cashflow-forecast')` exposes `CashFlowForecast` as a named export
and as `.default` for compatibility with default-import tooling.

### Constructor options

```js
new CashFlowForecast({
  openingCash: 100_000,       // default opening cash
  minCash: 50_000,            // default minimum cash alert threshold
  minCashRatio: 0.10,         // fallback ratio of monthly uses
  paymentDays: {              // override any Israeli payment day
    VAT: 15,
    PAYROLL_MAIN: 7,
    PAYROLL_ADVANCE: 22,
    INCOME_TAX: 15,
    BITUACH_LEUMI: 15,
    PENSION: 15,
  },
  rollingWeeks: 13,
  currency: 'ILS',
  now: () => new Date(),      // clock injector for testing
});
```

### Methods

| Method                                                         | Purpose                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| `buildDirectMethod({period, receipts, disbursements, openingCash})` | Build a period forecast from explicit receipts / disbursements. |
| `buildIndirectMethod({period, netIncome, dep, wcChanges, investing, financing, openingCash})` | Build a quarterly / annual forecast from net income.          |
| `weeklyRolling({startDate, weeks?, receipts, disbursements, openingCash})` | 13-week (default) rolling bucket cash forecast.                |
| `sources({ar, pipeline, recurring, events})`                   | Probability-weighted cash inflows.                             |
| `uses({ap, payroll, tax, loans, rent, other})`                 | Cash outflows with Israeli due dates baked in.                 |
| `stressTest({forecastId, shocks:[{item, pct}]})`               | Apply shocks; stores as new snapshot linked to base.           |
| `minimumCashAlert(threshold, forecastId?)`                     | Returns alerts on periods below minimum cash.                  |
| `coverageRatio({forecast, obligations})`                       | `inflows / obligations`; reports gap / surplus.                |
| `actualsVsForecast(period, actual?)`                           | Register actuals and compare to latest forecast of the period. |
| `generatePDF(forecast)`                                        | Bilingual PDF 1.4 buffer + SVG bar chart + metadata.           |
| `getForecast(id)`, `listForecasts()`, `getHistory()`           | Read-only accessors (defensive copies).                        |

---

## 3. Forecast methodologies

### 3.1 Direct method (שיטה ישירה)

```
closingCash = openingCash + Σ(receipts) - Σ(disbursements)
```

Each receipt / disbursement is a validated line item with:
`{label, amount, date?, category?, probability?}`. Amounts must be
non-negative (direction is encoded by whether the item is a receipt or
disbursement).

Internally: stored in the append-only forecasts map with a generated
`DCF_*` id, status `published`, and a timestamp.

### 3.2 Indirect method (שיטה עקיפה)

Classic reconciliation from net income to cash:

```
CFO = netIncome + depreciation + workingCapitalAdjustment
      where workingCapitalAdjustment = -ΔAR - ΔInventory + ΔAP + Δother
CFI = assetSales - capex - acquisitions
CFF = debtIssued - debtRepaid - dividends + equityIssued - equityRepurchased
netChange = CFO + CFI + CFF
closingCash = openingCash + netChange
```

The sign convention follows GAAP / IFRS: an *increase* in AR is a *use* of
cash (-ΔAR), an *increase* in AP is a *source* (+ΔAP). Callers pass the
*signed delta* of each working-capital line; the module handles the sign
flip for the reconciliation.

### 3.3 Reconciliation

The direct and indirect methods are two *views* of the same period, not two
competing calculations. For the same underlying transactions:

```
direct.netCashFlow == indirect.netChange
direct.closingCash == indirect.closingCash
```

Test `direct and indirect methods reconcile on a matched scenario` asserts
this equality on matched fixtures. In production, teams typically prepare the
indirect method from the GL and the direct method from AR/AP/treasury
systems; any variance between the two is a reconciling item.

### 3.4 13-week weekly rolling (13 שבועות)

Treasury's short-term operational view:

- Horizon defaults to `DEFAULT_ROLLING_WEEKS = 13` weeks; configurable 1..52.
- Start date snaps to the Sunday of the provided anchor (UTC).
- Each bucket has `{index, weekStart, weekEnd, receipts, disbursements,
  receiptsTotal, disbursementsTotal, netFlow, openingCash, closingCash}`.
- Items carry optional dates; undated items land in week 1; items outside
  the horizon are dropped (they can be rolled into a later forecast).
- Cash rolls forward: `buckets[i].openingCash === buckets[i-1].closingCash`.
- The whole snapshot is stored with a `WRF_*` id and is immutable.

---

## 4. Israeli payment schedule (לוח תשלומים ישראלי)

`uses()` computes due dates using `ISRAELI_PAYMENT_DAYS`, which encodes the
statutory / common-practice cadence of Israeli employers and taxpayers:

| Obligation                                                     | Due day | Legal basis                                                      |
| -------------------------------------------------------------- | ------- | ---------------------------------------------------------------- |
| **Payroll main** (שכר חודשי)                                  | 7th     | חוק הגנת השכר, התשי"ח-1958 §9 — by 9th of following month; common practice pays ~7th. |
| **Payroll advance** (מקדמת שכר — bi-monthly)                 | 22nd    | Industry practice (construction / retail) — ~22nd advance + ~7th settlement. |
| **VAT** (מע"מ)                                                | 15th    | חוק מס ערך מוסף, התשל"ו-1975 — monthly / bi-monthly report + payment. |
| **Income-tax withholding** (מס הכנסה ניכויים — טופס 102)     | 15th    | פקודת מס הכנסה — טופס 102 due by 15th of following month.       |
| **Bituach Leumi** (ביטוח לאומי)                              | 15th    | חוק הביטוח הלאומי — bundled into טופס 102.                      |
| **Pension** (פנסיה / הפקדות קופות גמל)                      | 15th    | תקנות קופות גמל — employer contributions by 15th of following month. |

### 4.1 Monthly payroll cadence (most employers)

```js
f.uses({
  payroll: { gross: 100_000, employerCostRatio: 1.25, month: '2026-04' },
  tax:     { vat: 20_000, incomeTax: 15_000, bituachLeumi: 12_000, pension: 8_000, month: '2026-04' },
});
```

Produces:
- Payroll (`total cost = gross × 1.25 = 125,000`) due **2026-05-07**.
- VAT, income tax, Bituach Leumi, and pension all due **2026-05-15**.

### 4.2 Bi-monthly payroll (construction / retail)

```js
f.uses({
  payroll: { gross: 100_000, employerCostRatio: 1.25, bimonthly: true, month: '2026-04' },
});
```

Produces:
- Payroll advance (`62,500`) due **2026-04-22** (same month).
- Payroll settlement (`62,500`) due **2026-05-07** (next month).

### 4.3 `employerCostRatio`

Default `1.25` bakes in the Israeli all-in employer cost multiplier covering
employer Bituach Leumi, pension contribution, education fund (קרן השתלמות),
severance provision (פיצויים), and health tax. Callers can override this per
payroll run.

---

## 5. Sources of cash (`sources()`)

Inflows are classified and probability-weighted:

1. **AR aging → collection probability**. Each receivable is bucketed by days
   outstanding and weighted by a conservative probability:

   | Bucket  | Days   | Probability |
   | ------- | ------ | ----------- |
   | current | 0      | 0.98        |
   | 1-30    | 1-30   | 0.95        |
   | 31-60   | 31-60  | 0.85        |
   | 61-90   | 61-90  | 0.60        |
   | 90+     | > 90   | 0.25        |

   The `expected` value is `amount × probability`. Teams with their own
   historical collection curves can override these by subclassing or by
   calling `sources()` with pre-weighted items and `probability: 1`.

2. **Sales pipeline → close probability**. Each opportunity carries an
   explicit `closeProbability` in `[0, 1]`; the expected inflow is
   `amount × closeProbability`. Mirrors CRM win-probability (AG-Y024 stages).

3. **Recurring inflows**. Contracted recurring revenue (SaaS subscriptions,
   rent received, maintenance fees) at their nominal amount with frequency.

4. **Investing / financing events**. One-off anticipated inflows — asset
   sales, dividends received, loan proceeds, equity raises.

Totals are aggregated as:

```
sources.totals = {arExpected, pipelineExpected, recurring, events, grandTotal}
```

---

## 6. Uses of cash (`uses()`)

Outflows are itemized with Israeli statutory due dates:

- **AP** — open supplier payables with explicit due dates.
- **Payroll** — see §4 for cadence logic.
- **Tax** — VAT, income-tax withholding, Bituach Leumi, pension (each
  labeled bilingually with its legal reference).
- **Loans** — term loan amortization, bullet payments.
- **Rent** — scalar or array of `{label, amount, dueDate}`.
- **Other recurring** — utilities, subscriptions, software, etc.

Return shape:

```js
{
  items: [...],          // normalized line items
  total:  Number,
  byCategory: {          // per-category aggregation
    'accounts-payable': ...,
    'payroll':          ...,
    'vat':              ...,
    'income-tax':       ...,
    'bituach-leumi':    ...,
    'pension':          ...,
    'loan-payment':     ...,
    'rent':             ...,
    'other':            ...,
  }
}
```

---

## 7. Stress testing (`stressTest`)

Scenarios are **append-only**: the original forecast is unchanged, and a new
snapshot is stored with:

- `baseForecastId`  linking back to the base
- `shocks`          the applied shocks
- `scenario: 'stress'`
- `status: 'draft'` (so it doesn't contaminate the official forecast)

### 7.1 Shock grammar

```js
f.stressTest({
  forecastId: base.forecastId,
  shocks: [
    { item: 'receipts',     pct: -30 },  // AR slowdown — 30% haircut
    { item: 'Customer A',   pct: -100 }, // customer lost entirely
    { item: 'disbursements', pct: +5 },  // margin pressure — 5% cost inflation
  ],
});
```

`item` can be:
- `'receipts'` / `'disbursements'` — aggregate all line items of that side.
- A specific `label` (e.g. `'Customer A'`) — shock only matching items.
- A `category` (e.g. `'payroll'`, `'vat'`) — shock by category.
- A `type` (e.g. `'tax'`).
- `'all'` / `'*'` — wildcard.
- For indirect forecasts: `'netIncome'`, `'dep'`, `'capex'`.

`pct` is signed — positive is an *increase*, negative is a *decrease*.

### 7.2 Canonical stress scenarios

| Scenario label                | Shocks                                                                 |
| ----------------------------- | ---------------------------------------------------------------------- |
| **AR slows 30 days**          | `{item:'ar', pct:-15}` — collections come in later                     |
| **Top customer lost**         | `{item:'<customer-name>', pct:-100}`                                   |
| **Margin compression 5%**     | `{item:'receipts', pct:-5}`                                            |
| **Cost inflation 3%**         | `{item:'disbursements', pct:+3}`                                       |
| **VAT deferral wind-down**    | `{item:'vat', pct:+100}` — move a paid-late VAT back into the window   |
| **Payroll raise 5%**          | `{item:'payroll', pct:+5}`                                             |
| **Capex pull-forward**        | `{item:'capex', pct:+20}` (indirect-method forecasts)                  |
| **Combined downside**         | `[{item:'receipts',pct:-20},{item:'disbursements',pct:+5}]`            |

After a stressTest, totals and rolled cash balances are recomputed — test
`stressTest reduces receipts by shock percentage without mutating base`
validates that the base stays intact while the stressed snapshot shows the
impact.

---

## 8. Minimum cash alert (`minimumCashAlert`)

Scans the forecast for periods (or weekly buckets) whose `closingCash` falls
below a threshold:

```js
const alert = f.minimumCashAlert(50_000, forecastId);
// → { threshold, alerts: [...], criticalPeriods, minCashReached, minCashReachedWhen, healthy }
```

Each alert carries a severity:

| Severity   | Condition                           |
| ---------- | ----------------------------------- |
| `critical` | `closingCash < 0`                   |
| `high`     | `0 <= closingCash < 0.5 × threshold` |
| `medium`   | `0.5 × threshold <= closingCash < threshold` |
| `low`      | at or above threshold               |

`healthy: true` when there are zero breaches across the horizon.

---

## 9. Coverage ratio (`coverageRatio`)

```
ratio = inflows / obligations
```

Both sides accept either a scalar or an object:
- Forecast: a number, a direct-method snapshot, or a weekly-rolling snapshot.
- Obligations: a number, a weekly-rolling snapshot, or the output of
  `uses()` (which exposes `.total`).

Returns `{ratio, gap, surplus, covered, inflow, outflow}`. `covered: true`
when `ratio >= 1`. `gap` is only set when there is a shortfall; `surplus` is
only set when there is excess coverage.

Banks and DSCR-style covenants often require `coverageRatio >= 1.20`.

---

## 10. Actuals vs forecast (`actualsVsForecast`)

Forecast accuracy loop:

```js
f.buildDirectMethod({period:'2026-Q2', ...});
f.actualsVsForecast('2026-Q2', { receipts: 90_000, disbursements: 60_000 });
```

Returns:

```js
{
  period, actual, forecast,
  variance: {receipts, disbursements, net},
  accuracy: 0.90,      // 1 - |variance.receipts| / forecast.totalReceipts
  mapePercent: 10,     // mean absolute percentage error on receipts
}
```

If no direct-method forecast exists for the period, returns a diagnostic
`{forecast: null, note: 'no forecast to compare / אין תחזית להשוואה'}`.

This powers an ongoing **forecast accuracy KPI** — the treasury team can
chart `accuracy` or `mapePercent` over time to see whether their
predictions are getting better or worse.

---

## 11. PDF + SVG chart (`generatePDF`)

`generatePDF(forecast)` returns:

```js
{
  buffer:    Buffer,                  // valid PDF 1.4 document (%PDF-1.4 .. %%EOF)
  text:      String,                  // bilingual plaintext summary
  svg:       String,                  // standalone SVG bar chart
  metadata:  {direction:'rtl', language:'he+en', forecastId, method, period, size, ...},
}
```

- **PDF** is built with a minimal self-contained PDF 1.4 writer using the
  built-in `Helvetica` Type-1 font. Hebrew labels are transliterated to
  ASCII (e.g. `tazrim mezumanim`) so the PDF is guaranteed-valid with zero
  external dependencies — the same pattern used in AG-Y047 (lease PDF) and
  AG-Y048 (facility PDF). Upgrade path: swap Helvetica for an embedded
  Alef / Heebo TTF font object when true Hebrew glyph rendering is required.

- **SVG chart** is a standalone, self-contained `<svg>` with a zero-line
  axis, positive bars in `#2e8b57` (green) and negative bars in `#b22222`
  (red). For weekly rolling forecasts the x-axis is `W1..W13` showing
  weekly `netFlow`; for direct-method period forecasts the bars are
  Receipts / Disbursements / Net; for indirect-method forecasts the bars
  are CFO / CFI / CFF / Net. The SVG is safe-escaped; `role="img"` and
  `aria-label` make it accessible.

- **Bilingual**: every line contains both the English label and the Hebrew
  transliteration (e.g. `Receipts / tkabulim`, `Closing cash / mezumanim
  sogerim`).

---

## 12. Test coverage

Test file: `onyx-procurement/test/finance/cashflow-forecast.test.js`
Total: **28 tests**, all passing.

| # | Suite area          | Test                                                                        |
| - | ------------------- | --------------------------------------------------------------------------- |
| 1 | direct              | totals and closing cash are correct                                         |
| 2 | direct              | rejects missing period or non-array inputs                                  |
| 3 | direct              | rejects negative amounts                                                    |
| 4 | indirect            | reconciles to closing cash (CFO/CFI/CFF/netChange)                          |
| 5 | reconciliation      | direct and indirect methods reconcile on a matched scenario                 |
| 6 | indirect            | rejects non-numeric netIncome                                               |
| 7 | rolling             | produces 13 buckets with rolled cash                                        |
| 8 | rolling             | roll-forward: each week openingCash == prior closingCash                    |
| 9 | rolling             | rejects invalid horizon                                                     |
| 10| sources             | weights AR by aging probability                                             |
| 11| sources             | rejects invalid probability                                                 |
| 12| uses                | computes Israeli payroll and tax due dates (monthly cadence)                |
| 13| uses                | computes bi-monthly payroll split for construction cadence                  |
| 14| uses                | aggregates loans, rent and other items                                      |
| 15| uses                | `ISRAELI_PAYMENT_DAYS` exposes correct calendar                             |
| 16| stress              | reduces receipts by shock percentage without mutating base                  |
| 17| stress              | supports label-matched shocks                                               |
| 18| stress              | applies to rolling forecasts                                                |
| 19| stress              | rejects unknown forecast or malformed shocks                                |
| 20| alert               | flags weeks below threshold                                                 |
| 21| alert               | returns healthy when all buckets >= threshold                               |
| 22| coverage            | computes inflows / obligations from forecast + uses()                       |
| 23| coverage            | reports gap when inflows < obligations                                      |
| 24| actuals             | computes variance and accuracy                                              |
| 25| actuals             | returns note when no forecast exists                                        |
| 26| pdf                 | emits a valid PDF 1.4 buffer with SVG chart                                 |
| 27| pdf                 | works for weekly rolling forecasts (chart per bucket)                       |
| 28| history             | append-only and records every mutation                                     |

Run locally:

```bash
cd onyx-procurement
node --test test/finance/cashflow-forecast.test.js
```

Example output tail:

```
ℹ tests 28
ℹ pass  28
ℹ fail  0
```

---

## 13. Stress scenarios playbook (מדריך תרחישים)

Recommended default library for treasury reviews — each takes a base
forecast and a weekly-rolling horizon of 13 weeks:

### 13.1 AR slowdown (האטת גבייה)

```js
f.stressTest({forecastId, shocks:[{item:'ar', pct:-20}]});
```

Models a 20% haircut on expected AR collections — a classic stress for
customers drifting out by 20-30 days.

### 13.2 Customer-loss (אובדן לקוח מרכזי)

```js
f.stressTest({forecastId, shocks:[{item:'Customer Alpha', pct:-100}]});
```

Removes the entire revenue stream from the named customer. Repeat per
top-5 customer.

### 13.3 Margin pressure (לחץ על שולי רווח)

```js
f.stressTest({forecastId, shocks:[
  {item:'receipts',     pct:-5},   // 5% price cut
  {item:'disbursements', pct:+3},  // 3% cost inflation
]});
```

Simulates a 500 bp margin compression.

### 13.4 Payroll increase (הסכם קיבוצי)

```js
f.stressTest({forecastId, shocks:[{item:'payroll', pct:+5}]});
```

Captures the cash impact of a 5% collective-bargaining salary bump.

### 13.5 Tax catch-up (תשלום מע"מ עתידי)

```js
f.stressTest({forecastId, shocks:[{item:'vat', pct:+100}]});
```

Used when a deferred VAT payment plan falls due inside the horizon.

### 13.6 Capex pull-forward (הקדמת השקעה)

For indirect-method forecasts:

```js
f.stressTest({forecastId, shocks:[{item:'capex', pct:+20}]});
```

---

## 14. Hebrew glossary (מילון מונחים)

| English                           | Hebrew                       | Transliteration                |
| --------------------------------- | ---------------------------- | ------------------------------ |
| Cash flow                         | תזרים מזומנים                 | `tazrim mezumanim`             |
| Cash flow forecast                | תחזית תזרים מזומנים            | `tachzit tazrim mezumanim`     |
| Direct method                     | שיטה ישירה                   | `shita yeshira`                |
| Indirect method                   | שיטה עקיפה                   | `shita akifa`                  |
| Receipts                          | תקבולים                      | `tkabulim`                     |
| Disbursements / payments          | תשלומים                      | `tashlumim`                    |
| Opening cash                      | מזומנים פותחים                | `mezumanim potchim`            |
| Closing cash                      | מזומנים סוגרים                | `mezumanim sogerim`            |
| Net cash flow                     | תזרים נטו                    | `tazrim neto`                  |
| Net income                        | רווח נקי / הכנסה נטו         | `revach naki`                  |
| Depreciation / amortization       | פחת והפחתה                   | `pachat ve-hafchata`           |
| Working capital                   | הון חוזר                     | `hon chozer`                   |
| Accounts receivable               | לקוחות                       | `lakochot`                     |
| Accounts payable                  | ספקים                        | `sapkim`                       |
| Inventory                         | מלאי                         | `melay`                        |
| Investing activities              | פעילות השקעה                 | `peilut hashkaa`               |
| Financing activities              | פעילות מימון                 | `peilut mimun`                 |
| Capex                             | השקעות הון                   | `hashkaot hon`                 |
| Debt issued                       | הנפקת חוב                    | `hanpakat chov`                |
| Debt repaid                       | פירעון חוב                   | `pira'on chov`                 |
| Dividends                         | דיבידנדים                    | `dividendim`                   |
| 13-week rolling forecast          | תחזית מתגלגלת — 13 שבועות     | `tachzit mitgalgelet — 13 shavuot` |
| Weekly bucket                     | חלון שבועי                   | `chalon shavui`                |
| AR aging                          | גיול לקוחות                  | `giyul lakochot`               |
| Collection probability            | הסתברות גבייה                 | `histabrut gviya`              |
| Sales pipeline                    | צינור מכירות                 | `tzinor mechirot`              |
| Close probability                 | הסתברות סגירה                | `histabrut sgira`              |
| Recurring revenue                 | הכנסה חוזרת                  | `hachnasa chozeret`            |
| Payroll                           | שכר                          | `sachar`                       |
| Gross salary                      | שכר ברוטו                    | `sachar bruto`                 |
| Net salary                        | שכר נטו                      | `sachar neto`                  |
| Employer cost                     | עלות מעסיק                   | `alut maasik`                  |
| Bi-monthly advance                | מקדמת שכר                    | `mikdamat sachar`              |
| Bituach Leumi / NII               | ביטוח לאומי                  | `bituach le'umi`               |
| Income-tax withholding            | ניכויים                      | `nikuyim`                      |
| Form 102                          | טופס 102                     | `tofes me'a u'shtayim`         |
| VAT                               | מע"מ                         | `ma'am`                        |
| Pension / provident fund          | פנסיה / קופת גמל             | `pensia / kupat gemel`         |
| Rent                              | שכר דירה                     | `schar dira`                   |
| Loan payment                      | פירעון הלוואה                | `pira'on halva'a`              |
| Stress test                       | מבחן לחץ                     | `mivchan lachatz`              |
| Shock                             | זעזוע                        | `zizua`                        |
| Customer lost                     | אובדן לקוח                   | `ovdan lakoach`                |
| Minimum cash                      | רף מזומנים מינימלי            | `raf mezumanim minimali`       |
| Shortfall                         | גירעון                       | `gira'on`                      |
| Coverage ratio                    | יחס כיסוי                    | `yachas kisui`                 |
| Actuals                           | בפועל                        | `be-fo'al`                     |
| Variance                          | סטייה                        | `stiya`                        |
| Forecast accuracy                 | דיוק תחזית                   | `diyuk tachzit`                |
| MAPE                              | שגיאה ממוצעת באחוזים          | `sh'gia memutza'at be-achuzim` |
| Append-only                       | הוספה בלבד                   | `hosafa bilvad`                |
| Audit log                         | יומן ביקורת                  | `yoman bikoret`                |

---

## 15. Compliance checklist

- [x] Zero external dependencies — pure Node (`Buffer`, `Date`, `Math`, `Map`).
- [x] `require('./cashflow-forecast')` returns a module exposing
      `CashFlowForecast` plus enum constants.
- [x] `buildDirectMethod` and `buildIndirectMethod` reconcile (test #5).
- [x] `weeklyRolling` produces exactly `weeks` buckets with roll-forward
      `buckets[i].openingCash === buckets[i-1].closingCash`.
- [x] Israeli payroll cadence — monthly by the 7th (within legal 9th cap),
      bi-monthly 22nd/7th for construction sector.
- [x] Israeli tax cadence — VAT / 102 / Bituach Leumi / pension by the 15th.
- [x] `stressTest` never mutates the base forecast (append-only).
- [x] `minimumCashAlert` returns severity per bucket.
- [x] `coverageRatio` reports gap vs surplus.
- [x] `actualsVsForecast` reports variance, accuracy, and MAPE percent.
- [x] `generatePDF` emits a valid PDF 1.4 buffer (`%PDF-1.4` … `%%EOF`).
- [x] Embedded self-contained SVG chart (`<svg>…</svg>`) with `aria-label`.
- [x] Bilingual public API — JSDoc, error messages, PDF lines.
- [x] Append-only `history` audit log exposed via `getHistory()`.
- [x] Test suite **28/28** green under `node --test`.
- [x] No data deletion. Every mutation produces a new snapshot or appended
      record — לא מוחקים רק משדרגים ומגדלים.

---

## 16. Next upgrades (growth, not replacement)

Following the rule of *upgrade, never delete*, planned extensions:

1. **AG-Y079b — X-04 bridge** — feed Y-079's deterministic point estimate
   into the Monte Carlo engine (`src/cash/monte-carlo.js`) as the mean of
   a stochastic simulation; publish P10/P50/P90 fan charts alongside the
   deterministic forecast.
2. **AG-Y079c — AR feed** — wire `src/collections/` and `src/sales/` into
   `sources()` so AR aging and pipeline come from live data rather than
   hand-entered line items.
3. **AG-Y079d — Payroll bridge** — pull the employer cost from
   `payroll-autonomous/` for the current month and seed `uses.payroll`
   automatically with real gross + actual employer cost ratio.
4. **AG-Y079e — GL posting loop** — after a forecast period closes, post
   the reconciling variance between forecast and actuals into the
   treasury control account via `src/gl/`.
5. **AG-Y079f — True Hebrew PDF glyphs** — replace the Helvetica font
   object with an embedded Alef / Heebo TTF so `generatePDF` renders
   Hebrew directly (matching the roadmap of AG-Y047).
6. **AG-Y079g — Bank feed reconciliation** — consume `src/bank/` daily
   statements to trigger `actualsVsForecast` automatically, producing a
   living forecast-accuracy KPI without manual data entry.
7. **AG-Y079h — Scenario library** — persist stress scenarios as named
   presets (e.g. `'AR_SLOWDOWN_30'`, `'LOST_TOP_CUSTOMER'`) so treasury
   can re-run them on every new forecast with a single call.

Every upgrade extends the public API; none removes or replaces existing
methods.

---

## 17. Files

| File                                                                 | Purpose                                  |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `onyx-procurement/src/finance/cashflow-forecast.js`                  | Module (class + constants + PDF/SVG)     |
| `onyx-procurement/test/finance/cashflow-forecast.test.js`            | 28 unit tests under `node:test`          |
| `_qa-reports/AG-Y079-cashflow-forecast.md`                           | This report                              |
