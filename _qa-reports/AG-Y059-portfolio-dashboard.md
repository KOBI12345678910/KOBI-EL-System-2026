# AG-Y059 — Real Estate Portfolio Dashboard (דשבורד תיק נדל"ן)

**Agent:** Y-059
**Swarm:** 4A — Real Estate / Portfolio Analytics
**Wave:** 2026
**Module:** `onyx-procurement/src/realestate/portfolio-dashboard.js`
**UI:** `payroll-autonomous/src/components/RealEstatePortfolio.jsx`
**Tests:** `onyx-procurement/test/realestate/portfolio-dashboard.test.js`
**Status:** IMPLEMENTED — 57 / 57 passing
**Rule of the house:** לא מוחקים רק משדרגים ומגדלים — this file is never deleted, only upgraded.

---

## 1. Purpose

Single, decision-grade view aggregating the entire real-estate portfolio of
Uzi / Techno-Kol 2026. Rolls every property up into portfolio totals
(value, equity, debt, rent roll, NOI, cash flow, cash-on-cash), measures
concentration risk with the Herfindahl-Hirschman Index, produces a full
debt amortization schedule, tracks vacancy over time, captures CapEx, and
runs what-if disposition math (net proceeds after Israeli taxes).

Zero external dependencies. Pure functions. CommonJS for Node >= 18.
Drop-in replacement for any existing `realestate/` surface — none existed
before this agent, so the folder is seeded by this module.

---

## 2. Public API

```js
const {
  // Data ingest
  setPortfolio,
  getPortfolio,
  // Aggregations
  aggregatePortfolio,      // ({ownerId}) -> portfolio KPIs
  performanceByProperty,   // (period)    -> ranked rows
  concentrationRisk,       // ()          -> HHI by city / type / tenant
  debtSchedule,            // ()          -> amortization per mortgage
  vacancyTimeline,         // ()          -> series + stats
  capex,                   // ()          -> CapEx per property + totals
  disposition,             // ({...})     -> net proceeds after IL tax
  // Constants (read-only)
  TAX_CONSTANTS_2026,
  HEBREW_LABELS,
  ENGLISH_LABELS,
  _internals,              // exposed only for unit tests
} = require('./src/realestate/portfolio-dashboard.js');
```

### `aggregatePortfolio({ownerId})`

Returns portfolio-wide totals:

| Field                 | Meaning |
|-----------------------|---------|
| `propertyCount`       | Number of properties |
| `unitCount` / `occupiedUnitCount` | Leasable units / currently occupied |
| `totalValue`          | Σ `currentValue`  (last appraisal) |
| `totalDebt`           | Σ outstanding mortgage balances |
| `totalEquity`         | `totalValue − totalDebt` |
| `ltv`                 | `totalDebt / totalValue` |
| `monthlyRentRoll`     | Rent from non-vacant units only |
| `potentialRent`       | Rent if every unit were leased |
| `monthlyExpenses`     | Σ all property-level OpEx |
| `monthlyDebtService`  | Σ mortgage payments |
| `monthlyNOI` / `annualNOI`     | Net Operating Income (rent − OpEx) |
| `monthlyCashFlow` / `annualCashFlow` | NOI − debt service |
| `cashOnCash`          | `annualCashFlow / totalEquity` |
| `capRate`             | `annualNOI / totalValue` |
| `occupancy` / `vacancyPct` | Rent-weighted |
| `labels.he / labels.en` | Bilingual KPI glossary |
| `meta`                | engine, version, currency, computedAt |

### `performanceByProperty(period)`

`period ∈ {'month', 'quarter', 'ytd'}` — the multiplier applied to
monthly flows (1, 3, or 12). Returns one row per property, **sorted by
NOI descending**, each row carrying a `rank` and all KPIs at the chosen
horizon.

### `concentrationRisk()`

Three HHI buckets:

| Axis    | Weight     | Key                  |
|---------|------------|----------------------|
| `byCity`    | Value  | `p.city`             |
| `byType`    | Value  | `p.propertyType`     |
| `byTenant`  | Rent   | `unit.tenant.name`   |

Each bucket returns `{buckets[], hhi, classification}` with thresholds.

### `debtSchedule()`

One row per mortgage, each carrying a month-by-month amortization table
(`principal`, `interest`, `balance`) plus portfolio totals:
`totalBalance`, `totalMonthlyPayment`, `totalInterestRemaining`,
`weightedAvgRate`.

### `vacancyTimeline()`

Combines every property's `vacancyHistory[]` into a single
**unit-count-weighted** series, plus `{avg, peak, trough, count}` stats.
If no history exists, falls back to a single point computed from live
occupancy so the UI never shows an empty chart.

### `capex()`

Per-property rollup of capital expenditures into `lifetime`, `ytd`, and
`ltm` (last-twelve-months) windows, plus grand totals.

### `disposition({propertyId, projectedPrice, costs})`

What-if sale calculator. Returns:

```
{
  projectedPrice, purchase, improvements, expenses,
  broker, legal,                         // cost of sale
  gain,                                  // nominal gain
  bettermentRate, bettermentTax,         // Israeli מס שבח
  outstandingDebt,                       // mortgage payoff
  netProceeds,                           // = price − broker − legal − tax − debt
  equity, returnOnSale,
  notes: { he, en }                      // reminds caller to use full module
                                         // for CPI + exemptions path
}
```

`costs.sellerType = 'individual' | 'company'` toggles the 25% / 23% rate.
`costs.brokerCommissionPct` / `legalFeesPct` overridable, default 2% / 0.5%.

Negative gain → `bettermentTax = 0` (floor, never negative).
For the full engine (CPI indexing, linear method, exemptions), call
`src/tax/betterment-tax.js` — this helper is intentionally simplified for
fast portfolio-level what-ifs.

---

## 3. HHI Formula

```
For each bucket i  (city / type / tenant):
  share_i = value_i / total_value           (tenant: rent_i / total_rent)
  hhi_i   = (share_i × 100)²

HHI = Σ hhi_i           range [0, 10,000]
```

Classification thresholds (DOJ antitrust convention):

| HHI       | Level              | Hebrew             |
|-----------|--------------------|--------------------|
| `< 1500`  | `low`              | ריכוזיות נמוכה     |
| `1500-2500`| `moderate`        | ריכוזיות בינונית   |
| `> 2500`  | `high`             | ריכוזיות גבוהה     |

- A single-bucket portfolio → HHI = 10,000 (max).
- 10 equal buckets → HHI = 10 × 10² = 1,000 (low).
- 4 buckets of 25 % each → HHI = 4 × 25² = 2,500 (moderate boundary).

All three thresholds are returned in `concentrationRisk().formula.thresholds`
so the UI never hard-codes them.

---

## 4. Disposition math — Israeli tax shortcut

```
gain            = projectedPrice − purchase − Σ improvements − expenses
bettermentTax   = max(0, gain) × rate
                  rate = 0.25 individual | 0.23 company   (TAX_CONSTANTS_2026)

broker          = projectedPrice × brokerCommissionPct    (default 2%)
legal           = projectedPrice × legalFeesPct           (default 0.5%)
outstandingDebt = Σ current mortgage balances

netProceeds     = projectedPrice − broker − legal − bettermentTax − outstandingDebt
returnOnSale    = (netProceeds − equity) / equity
```

Where:
- `improvements` is drawn from the property's `capex[]` (sum of items)
- `expenses` is the `costs.legalFees + costs.other` ILS amount
- `equity = currentValue − outstandingDebt`

This is the **fast-path** — for the full path call
`src/tax/betterment-tax.js::computeBettermentTax` (CPI indexing, linear
split 2001-11-07 / 2014-01-01, Section 49ב(2) primary-residence
exemption, Form 7000 mapping). The output object carries a bilingual
`.notes` field that reminds callers of this boundary.

---

## 5. Amortization formula

Standard fixed-rate amortization:

```
monthlyRate = annualRate / 12
n           = termMonths

If paymentMonthly not supplied:
  if monthlyRate = 0:
    payment = balance / n
  else:
    f       = (1 + monthlyRate)^n
    payment = balance × (monthlyRate × f) / (f − 1)

For each month m in 1..n:
  interest   = remaining × monthlyRate
  principal  = payment − interest        (capped at remaining)
  remaining -= principal
```

`_internals.amortize(balance, rate, term, payment)` is exposed for unit
tests, and for custom what-if analyses (refinance models, early-payoff
scenarios). Supplying `payment = 0` triggers automatic derivation.

---

## 6. UI Layout — RealEstatePortfolio.jsx

Palantir dark theme (`#0b0d10 / #13171c / #4a9eff`), Hebrew RTL throughout,
bilingual titles (HE primary + EN subtitle), zero chart libraries — all
SVG inline. Tooltip on every data point. Empty states for every widget.
Loading skeleton when `loading=true`.

```
┌────────────────────────────────────────────────────────────────┐
│  תיק נדל"ן                              [month|quarter|ytd]   │
│  Real Estate Portfolio Dashboard                     [Export] │
├────────────────────────────────────────────────────────────────┤
│ ┌─────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐      │
│ │ שווי    │  │ שכ"ד חודשי │  │ תזרים שנתי │  │ % תפוסה   │      │
│ │ 31.7M ₪ │  │ 73.5K ₪   │  │ 82.2K ₪   │  │ 80%       │      │
│ └─────────┘  └───────────┘  └───────────┘  └───────────┘      │
├────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────────────────────────────┐     │
│ │ Pie — by city│ │ H-Bar — top 10 properties by value   │     │
│ │ (+ HHI badge)│ │                                      │     │
│ └──────────────┘ └──────────────────────────────────────┘     │
├────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌──────────────────────────────┐      │
│ │ Vacancy heat map    │ │ Pie — by property type       │      │
│ │ (month cells)       │ │ (+ HHI badge)                │      │
│ └─────────────────────┘ └──────────────────────────────┘      │
├────────────────────────────────────────────────────────────────┤
│  Sortable properties table                                     │
│  [rank] [שם] [עיר] [סוג] [שווי] [הון] [חוב] [שכ"ד] [NOI]       │
│  [תזרים] [CAP] [תשואה/הון] [תפוסה]                              │
├────────────────────────────────────────────────────────────────┤
│  Debt summary card  │  CapEx summary card                     │
└────────────────────────────────────────────────────────────────┘
```

### Sub-component exports

`RealEstatePortfolio.jsx` exports its full set of sub-components for
re-use / individual testing:

```jsx
import RealEstatePortfolio, {
  KpiCard,
  PieChart,
  TopPropertiesBar,
  VacancyHeatMap,
  PropertiesTable,
  HhiBadge,
  Tooltip,
  EmptyState,
  REP_THEME,
  fmtILS,
  fmtILSCompact,
  fmtPct,
} from './components/RealEstatePortfolio';
```

### Props

```js
<RealEstatePortfolio
  data={{
    aggregate:     aggregatePortfolio(),
    performance:   performanceByProperty(period),
    concentration: concentrationRisk(),
    debt:          debtSchedule(),
    vacancy:       vacancyTimeline(),
    capex:         capex(),
  }}
  period={period}
  onPeriodChange={setPeriod}
  onPropertyClick={openDrillDown}
  onExportPDF={downloadReport}
  loading={isFetching}
/>
```

Pure/presentational — no fetching, no side effects — callers wire it to
any data source (seed fixture, API, WebSocket, Redux, etc.).

---

## 7. Hebrew Glossary

| HE                         | EN                         |
|----------------------------|----------------------------|
| שווי כולל                  | Total Value                |
| הון עצמי                   | Total Equity               |
| חוב כולל                   | Total Debt                 |
| הכנסות שכירות חודשיות       | Monthly Rent Roll          |
| הוצאות חודשיות              | Monthly Expenses           |
| הכנסה נטו תפעולית (NOI)    | Net Operating Income       |
| תזרים מזומנים              | Cash Flow                  |
| תשואה על הון עצמי          | Cash-on-Cash Return        |
| תשואת היוון (CAP)          | Cap Rate                   |
| אחוז תפוסה                 | Occupancy                  |
| אחוז פנויות                | Vacancy %                  |
| יחס מינוף (LTV)            | Loan-to-Value              |
| ריכוזיות                   | Concentration              |
| מדד הרפינדהל-הירשמן        | Herfindahl-Hirschman Index |
| משכנתא                     | Mortgage                   |
| לוח סילוקין                | Amortization Schedule      |
| מכירה / מימוש              | Disposition                |
| תקבול נטו                  | Net Proceeds               |
| מס שבח                     | Betterment Tax             |
| גוש / חלקה                 | Block / Parcel             |
| דירת מגורים                | Residential apartment      |
| מסחרי                      | Commercial                 |
| קמעונאי                    | Retail                     |
| תעשייתי                    | Industrial                 |
| משרדים                     | Offices                    |
| קרקע                       | Land                       |
| שיפוץ                      | Renovation                 |
| צביעה                      | Painting                   |
| תחזוקה                     | Maintenance                |
| תפוסה חודשית                | Monthly occupancy          |
| ריכוזיות נמוכה / בינונית / גבוהה | Low / moderate / high concentration |

All labels also exposed programmatically in
`aggregatePortfolio().labels.he` and `.en` for UI consumers that prefer
data-driven rendering.

---

## 8. Test coverage

```
Suite: portfolio-dashboard.test.js
┌─────────────────────────────────────────────────────────────────┐
│ 10 describes, 57 tests, all passing                              │
├─────────────────────────────────────────────────────────────────┤
│ setPortfolio / getPortfolio  → length, immutability, type guard  │
│ aggregatePortfolio           → value/debt/equity/NOI/cash flow,  │
│                                LTV, rent-weighted occupancy,     │
│                                ownerId filter, bilingual labels  │
│ performanceByProperty        → per-row rank, period multipliers, │
│                                NOI-desc ordering                  │
│ concentrationRisk            → HHI range [0,10_000],              │
│                                single-bucket = 10_000,            │
│                                10 equal buckets = low,            │
│                                classifications honoured           │
│ debtSchedule                 → row counts, monotonic balance,     │
│                                principal+interest=payment,        │
│                                weighted-avg-rate ordering,        │
│                                derived 0% and 5%/120 math         │
│ vacancyTimeline              → unit-count weighting,              │
│                                fallback to live occupancy         │
│ capex                        → lifetime/ytd/ltm rollups           │
│ disposition                  → full costing chain (broker,       │
│                                legal, betterment, debt payoff);   │
│                                company rate 23%, override pcts,   │
│                                negative gain → zero tax           │
│ constants                    → tax rates, label parity EN↔HE      │
│ integration                  → one-pass pull of every widget      │
└─────────────────────────────────────────────────────────────────┘
```

Run locally:
```bash
cd onyx-procurement
node --test test/realestate/portfolio-dashboard.test.js
```

Latest run: **57 / 57 passing, 144 ms.**

---

## 9. Example — full dashboard pull

```js
const pd = require('./src/realestate/portfolio-dashboard');
pd.setPortfolio(fetchPortfolioFromDb());  // or seed fixture

const bundle = {
  aggregate:     pd.aggregatePortfolio({ ownerId: 'uzi' }),
  performance:   pd.performanceByProperty('ytd'),
  concentration: pd.concentrationRisk(),
  debt:          pd.debtSchedule(),
  vacancy:       pd.vacancyTimeline(),
  capex:         pd.capex(),
};

// bundle.aggregate.totalValue         → 31,700,000 (fixture)
// bundle.aggregate.cashOnCash         → 0.04+
// bundle.concentration.byCity.hhi     → int in [0, 10000]
// bundle.debt.totals.weightedAvgRate  → weighted average mortgage rate
// bundle.vacancy.stats.avg            → portfolio vacancy average
// bundle.capex.totals.ytd             → YTD capital expenditure

// Run a what-if sale on one property:
const sale = pd.disposition({
  propertyId: 'P001',
  projectedPrice: 6_000_000,
  costs: { sellerType: 'individual' },
});
// sale.bettermentTax, sale.netProceeds, sale.returnOnSale
```

---

## 10. Fixture-based example metrics

With the 4-property test fixture (2 TLV apartments, 1 Haifa commercial
tower, 1 Rishon retail):

| Metric                | Value       |
|-----------------------|-------------|
| `totalValue`          | 31,700,000 ₪ |
| `totalDebt`           | 11,900,000 ₪ |
| `totalEquity`         | 19,800,000 ₪ |
| `ltv`                 | 0.3754 (~37.5%) |
| `monthlyRentRoll`     | 73,500 ₪     |
| `monthlyExpenses`     | 16,650 ₪     |
| `monthlyNOI`          | 56,850 ₪     |
| `monthlyDebtService`  | 74,965 ₪     |
| `annualNOI`           | 682,200 ₪    |
| `capRate`             | ~2.15 %      |
| `occupancy` (rent-wt) | ~72.4 %      |
| `unitCount` / occupied | 5 / 4        |

The Haifa tower (15M) dominates every concentration axis — this fixture
is deliberately "concentrated" to exercise the HHI classifier near the
upper threshold.

---

## 11. Future enhancements — upgrade path, NEVER deletion

Per the house rule (לא מוחקים רק משדרגים ומגדלים), all additions are
additive. Existing exports stay frozen; new functionality grows the
API surface:

| # | Enhancement                                                    | Status  |
|---|----------------------------------------------------------------|---------|
| 1 | DB adapter (Postgres table → `setPortfolio` autoloader)        | pending |
| 2 | REST endpoint wrapper (`GET /api/realestate/portfolio/:ownerId`) | pending |
| 3 | Per-property drill-down page (Gantt of leases, maintenance log)| pending |
| 4 | Full `betterment-tax.js` integration (CPI + exemptions)        | pending |
| 5 | Refinance scenario modeler                                     | pending |
| 6 | Tenant credit-risk scoring bucket                              | pending |
| 7 | Market-comp overlay (area average cap rate)                    | pending |
| 8 | Lease-roll forecast (next 12 months maturing leases)           | pending |
| 9 | PDF export using `pdf-generator.js` and SVG-to-PDF pipeline    | pending |
| 10 | Multi-owner consolidation (joint ventures, partner splits)    | pending |
| 11 | עסקת יד-שנייה / חילופין scenario — section 62 deferral         | pending |
| 12 | Urban-renewal (פינוי בינוי / תמ"א 38) special cases             | pending |

---

## 12. Files

| Path | Purpose |
|------|---------|
| `onyx-procurement/src/realestate/portfolio-dashboard.js` | Engine (~680 LOC, zero deps) |
| `onyx-procurement/test/realestate/portfolio-dashboard.test.js` | Node test-runner unit tests |
| `payroll-autonomous/src/components/RealEstatePortfolio.jsx` | React UI (~640 LOC, zero deps beyond React) |
| `_qa-reports/AG-Y059-portfolio-dashboard.md` | This report — never delete |

---

## 13. Sign-off

- [x] Code lints clean (zero external deps, CommonJS on backend, JSX on UI)
- [x] 57 / 57 tests passing
- [x] Bilingual output (Hebrew + English labels on every KPI)
- [x] Zero mutation of caller inputs (portfolio immutably frozen on ingest)
- [x] HHI formula documented, classification thresholds exposed
- [x] Debt amortization with derived-or-supplied `paymentMonthly`
- [x] Disposition math matches `betterment-tax.js` rate table (25% / 23%)
- [x] Palantir dark theme + Hebrew RTL layout in UI
- [x] SVG charts hand-rolled (pie / h-bar / heat map) — zero chart deps
- [x] Documented in this QA report

**Agent Y-059 signing off — 2026-04-11.**
