# AG-Y007 — Betterment Tax Engine (מס שבח מקרקעין)

**Agent:** Y-007
**Swarm:** 3C — Tax Compliance / Real Estate
**Wave:** 2026
**Module:** `onyx-procurement/src/tax/betterment-tax.js`
**Tests:** `onyx-procurement/test/tax/betterment-tax.test.js`
**Status:** IMPLEMENTED — 34 / 34 passing
**Rule of the house:** לא מוחקים רק משדרגים ומגדלים — file never to be deleted, only enhanced.

---

## 1. Purpose

Implements the Israeli **betterment tax (מס שבח)** engine per
**חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963**. Computes the tax owed when
real estate is sold, applying CPI indexing, linear period split, and every
exemption in פרק חמישי 1 of the law. Zero external dependencies, bilingual
Hebrew/English output, pure functions, fully unit-tested.

Designed to be dropped into the מגה-ERP tax compliance surface and called by:
- the seller self-service wizard (UI flow — compute + form preview)
- the annual-tax package that aggregates real-estate events
- the automation that pre-computes estimated shevach for owned properties

---

## 2. Public API

```js
const {
  computeBettermentTax,
  checkExemption,
  linearSplit,
  indexByCpi,
  buildForm7000Fields,
  TAX_RATES,
  KEY_DATES,
  LAW_CITATIONS,
  EXEMPTION_CEILINGS_2026,
} = require('./src/tax/betterment-tax');
```

### `computeBettermentTax(params)`
Top-level computer. Returns a deeply structured object with:

| Path                              | Meaning |
|-----------------------------------|---------|
| `.betterment.nominal`             | שבח נומינלי = sale − purchase − improvements − expenses |
| `.betterment.real`                | שבח ריאלי (after CPI adjustment of purchase + improvements) |
| `.betterment.inflationComponent`  | הרכיב האינפלציוני = nominal − real |
| `.betterment.purchaseIndexed`     | מחיר רכישה מתואם |
| `.improvements[]`                 | Per-improvement indexing detail (nominal, adjusted, CPI factor) |
| `.expenses[]`                     | Deductible expense breakdown |
| `.regular`                        | 25%/23% regular method result |
| `.linear`                         | Linear split (pre-2001 / pre-2014 / post-2014 segments) |
| `.linearExempt`                   | Linear-exempt path (only when primary residence) |
| `.fullExemption`                  | 49ב(2) full exemption when applicable |
| `.exemptions`                     | Output of `checkExemption` |
| `.candidates[]`                   | All computation methods sorted by tax ascending |
| `.bestMethod`                     | Lowest-tax method for the seller |
| `.totalTax`                       | Final liability (from `bestMethod`) |
| `.form7000Fields`                 | Pre-filled מש"ח / Form 7000 fields |
| `.meta`                           | Engine, version, currency, computedAt |

### `checkExemption(params)`
Returns `{eligible[], blocked[], notes[], recommendation}` listing every rule
that could apply, with full Hebrew/English citations for each section.

### `linearSplit({purchaseDate, saleDate, realBetterment, ...})`
Lower-level helper for period-split math. Exposed for custom flows
(e.g. what-if analyses, valuation tools).

### `indexByCpi(value, fromDate, toDate, cpiTable)`
CPI linker returning `{adjusted, factor, cpiFrom, cpiTo}`.
Falls back to factor 1.0 when the table is missing, so the engine still
produces a sensible answer even without a CPI feed.

### `buildForm7000Fields(ctx)`
Maps calculated values to the blocks of Form 7000 / תצהיר מוכר (מש"ח).

---

## 3. Rate Table — by ownership period

| Period                     | Boundary          | Individual rate                     | Company rate | Law citation |
|----------------------------|-------------------|-------------------------------------|--------------|--------------|
| Pre-reform                 | before 2001-11-07 | **10%** (inflationary / היסטורי)    | 23%          | סעיף 48א(ב) |
| Pre-2014                   | 2001-11-07 → 2014-01-01 | **25%** regular *or* **0%** if linear-exempt + דירה מזכה | 23% | סעיף 48א + תיקון 76 |
| Post-2014                  | from 2014-01-01   | **25%**                              | 23%          | סעיף 48א |
| Elderly-age relief (opt.)  | any period        | **20%** when applicable              | n/a          | סעיף 48א(ב) |

**Boundary source:** `KEY_DATES.LINEAR_BOUND = '2014-01-01'` — תיקון 76 of
the law, effective 01 January 2014. This is the critical cut-off for the
linear-exempt calculation (חישוב ליניארי מוטב): pre-2014 real betterment on
דירת מגורים מזכה is zero-rated.

**Secondary boundary:** `KEY_DATES.PRE_REFORM_BOUND = '2001-11-07'` — 2001
reform date used for the historical-rate slice (the pre-2001 window uses the
10% inflation-component rate under סעיף 48א(ב)).

---

## 4. Linear method formula

For a sale that straddles the 2014 boundary, the module computes:

```
totalDays   = daysBetween(purchaseDate, saleDate)

For each period ∈ {pre-2001, pre-2014, post-2014}:
  daysInPeriod  = max(0, min(saleDate, periodEnd) − max(purchaseDate, periodStart))
  share         = daysInPeriod / totalDays
  gain          = realBetterment × share
  rate          = TAX_RATES[period]  (see table above)
  tax           = gain × rate

totalLinearTax  = Σ tax per period
```

Where:
- `pre-2001  = [purchase,                   min(sale, 2001-11-07)]`
- `pre-2014  = [max(purchase, 2001-11-07),  min(sale, 2014-01-01)]`
- `post-2014 = [max(purchase, 2014-01-01),  sale]`

Zero-day segments are kept in the returned array with `days = 0`,
`gain = 0`, `tax = 0` — this makes downstream aggregation and form generation
uniform regardless of when the purchase fell.

**Linear-exempt (חישוב ליניארי מוטב)**: the only change is that the `pre-2014`
segment rate becomes `0` when the property is a **דירת מגורים מזכה** and the
seller requests the beneficial path. The pre-2001 slice still uses its
10% historical rate; the post-2014 slice still uses 25%.

---

## 5. Nominal vs. real betterment

```
nominalBetterment = sale − purchase − Σ improvements − expenses
realBetterment    = sale − purchase_indexed − Σ improvements_indexed − expenses
inflationComponent = nominalBetterment − realBetterment    (always ≥ 0)
```

- `purchase_indexed`          = `purchase × CPI(sale) / CPI(purchase)`
- `improvements_indexed[i]`   = `improvement[i].amount × CPI(sale) / CPI(improvement[i].date)`

The purchase and each improvement are indexed **independently** — an old
improvement generally receives a larger CPI factor than a newer one. Expenses
(legal fees, broker commissions, purchase tax, etc.) are **not** indexed;
they enter the formula at their nominal ILS value.

The engine rounds every ILS figure to 2 decimals (`round2` helper) to keep
output stable across platforms and prevent FP drift.

---

## 6. Exemption rules — citations

| Key                | Section              | Rule                                                             | Citation        |
|--------------------|----------------------|------------------------------------------------------------------|-----------------|
| `SECTION_49B2`     | 49ב(2)               | פטור לדירת מגורים יחידה under ceiling 5,008,000 ₪ (2026)          | `LAW_CITATIONS.SECTION_49B2` |
| `SECTION_49B1`     | 49ב(1)               | תקופת צינון 4 שנים — blocked if another residence sold recently  | `LAW_CITATIONS.SECTION_49B1` |
| `SECTION_49B5`     | 49ב(5)               | פטור בהורשה — inherited from spouse/descendant                    | `LAW_CITATIONS.SECTION_49B5` |
| `SECTION_62`       | 62                   | מתנה בין קרובים — tax deferral (NOT exemption)                    | `LAW_CITATIONS.SECTION_62`   |
| `SECTION_48A_B1`   | 48א(ב1)              | חישוב ליניארי מוטב — pre-2014 residential portion zero-rated      | `LAW_CITATIONS.SECTION_48A_B1` |

Every rule is returned as a structured object containing:
```
{
  key:         'SECTION_49B2',
  citation:    {he: 'סעיף 49ב(2) …', en: 'Section 49B(2) …'},
  title_he:    'פטור לדירה יחידה',
  title_en:    'Single-residence exemption',
  conditions_he: [...],    // human-readable checklist
  ceiling:     5_008_000   // when applicable
}
```

### Blocked rules

`checkExemption` also surfaces **blocked** rules — exemptions that would
otherwise apply but were vetoed by a counter-condition (e.g. prior residence
sold within 18 months, or 4-year cool-down not complete). Each blocked entry
carries a `reason_he` / `reason_en` pair so the UI can explain *why*.

### Ceiling — סעיף 49א(א1)

`EXEMPTION_CEILINGS_2026.SINGLE_RESIDENCE = 5,008,000 ₪` is the 2026-updated
value ceiling. When the sale price exceeds the ceiling, the full exemption
path degrades to the linear-exempt method, and the delta above the ceiling is
taxed pro-rata.

---

## 7. Form fields — מש"ח / Form 7000 / תצהיר מוכר

`buildForm7000Fields(ctx)` maps the engine output to the official block
structure used by רשות המסים:

| Block | Name                     | Fields |
|-------|--------------------------|--------|
| 1     | פרטי הנכס                | propertyType, address, block (גוש), parcel (חלקה), subParcel (תת-חלקה) |
| 2     | פרטי העסקה               | saleDate, salePrice, purchaseDate, purchasePrice |
| 3     | חישוב השבח               | field_11_nominal, field_12_indexedPurchase, field_13_improvements, field_14_improvementsAdjusted, field_15_expenses, field_16_inflationComponent, field_17_realBetterment |
| 4     | שומה                     | method, methodLabel_he, taxDue, dueDate |
| 5     | הצהרת פטור               | claimedExemption, sellerSignature, signatureDate |

The returned object is a plain `{}` — no mutation of caller state, no I/O —
ready to be serialized to JSON, piped into a PDF renderer, or sent over the
wire to the filing integration layer.

---

## 8. Seller-best method selection

The calculator **always** computes every relevant method and sorts them by
tax ascending; `bestMethod` is the first element of the sorted list.
Candidates always include:

1. **regular** — straight 25% (individual) or 23% (company) on the real betterment.
2. **linear** — split across pre-2001 / pre-2014 / post-2014 segments (non-exempt).
3. **linear-exempt** — only added for residential + primary residence. Pre-2014 portion zero-rated.
4. **full-exempt** — only added when סעיף 49ב(2) applies *and* sale ≤ ceiling.

The UI surfaces all of them via `calc.candidates` so the seller or accountant
can override the automatic choice if tactical considerations apply (e.g.
preserving the 4-year cool-down window for a future sale).

---

## 9. Test coverage

```
Suite: betterment-tax.test.js
┌───────────────────────────────────────────────────────────────┐
│ 10 describes, 34 tests, all passing                            │
├───────────────────────────────────────────────────────────────┤
│ constants              → KEY_DATES, TAX_RATES, LAW_CITATIONS   │
│ internal helpers       → parseDate, daysBetween, indexByCpi    │
│ linearSplit            → 2014 boundary split, company 23%,     │
│                          linear-exempt zeroing pre-2014        │
│ primary residence      → 49ב(2) eligible / blocked / full path │
│ four-year cool-down    → 49ב(1) eligible / blocked             │
│ improvements indexing  → per-improvement CPI, reduction effect │
│ company seller         → 23% rate applied                       │
│ Form 7000 fields       → blocks 1-5 present                     │
│ error handling         → input validation                       │
│ integration            → full end-to-end call                   │
└───────────────────────────────────────────────────────────────┘
```

Run locally:
```bash
cd onyx-procurement
node --test test/tax/betterment-tax.test.js
```

---

## 10. Examples

### Example A — Straddles 2014, primary residence, linear-exempt wins

```js
const calc = computeBettermentTax({
  purchase: 1_500_000,
  sale: 4_800_000,
  purchaseDate: '2009-01-01',
  saleDate: '2024-06-01',
  improvements: [{ amount: 120_000, date: '2012-03-10', description: 'הרחבה' }],
  expenses: 60_000,
  propertyType: 'apartment',
  isPrimaryResidence: true,
  sellerStatus: 'individual',
  cpiTable: CPI_TABLE,
});

// calc.bestMethod.method        → 'full-exempt'  (sale ≤ 5,008,000)
// calc.totalTax                 → 0
// calc.linearExempt.totalTax    → non-zero fallback (used if ceiling breached)
// calc.exemptions.eligible[0].key → 'SECTION_49B2'
```

### Example B — Commercial sale, company seller, 23%

```js
const calc = computeBettermentTax({
  purchase: 5_000_000,
  sale: 10_000_000,
  purchaseDate: '2015-01-01',
  saleDate: '2025-01-01',
  improvements: [],
  expenses: 0,
  propertyType: 'commercial',
  isPrimaryResidence: false,
  sellerStatus: 'company',
});

// calc.regular.rate             → 0.23
// calc.bestMethod.method        → 'regular' | 'linear'
// All linear period rates       → 0.23
```

### Example C — Secondary residence, cool-down blocked

```js
const result = checkExemption({
  propertyType: 'apartment',
  isPrimaryResidence: false,
  soldPriorResidenceWithin4y: true,
});

// result.blocked[0].key          → 'SECTION_49B1'
// result.blocked[0].reason_he    → 'תקופת הצינון של 4 שנים לא הושלמה…'
```

---

## 11. Future enhancements (on upgrade path, NEVER deletion)

Per the house rule (לא מוחקים רק משדרגים ומגדלים), future work enhances this
module without touching existing behaviour:

| # | Enhancement | Status |
|---|-------------|--------|
| 1 | Full historical CPI table (Israeli CBS, 1951-present) as bundled JSON | pending |
| 2 | Progressive marginal option for individual — for rare cases when 25% > marginal | pending |
| 3 | Elderly (age ≥ 60) relief under סעיף 48א(ב) — 20% reduced rate | pending |
| 4 | Integration with annual-tax-routes for automatic aggregation | pending |
| 5 | PDF renderer for the תצהיר מוכר form | pending |
| 6 | Multi-seller splits (spouses, partners) | pending |
| 7 | Special cases: urban-renewal (פינוי בינוי / תמ"א 38) | pending |
| 8 | Capital-loss carry-forward against prior שבח gains | pending |
| 9 | API endpoint wrapper (`POST /api/tax/betterment/compute`) | pending |
| 10 | Persistence layer — store every computation for audit trail | pending |

Every item is **additive**. The existing public API is frozen once this
module is merged; new features add new named exports or extend the returned
object with new keys.

---

## 12. Files

| Path | Purpose |
|------|---------|
| `onyx-procurement/src/tax/betterment-tax.js` | Engine (~750 LOC, zero deps) |
| `onyx-procurement/test/tax/betterment-tax.test.js` | Node test-runner unit tests |
| `_qa-reports/AG-Y007-betterment-tax.md` | This report — never delete |

---

## 13. Sign-off

- [x] Code lints clean (no external deps, CommonJS)
- [x] 34 / 34 tests passing
- [x] Bilingual output (Hebrew + English)
- [x] Zero mutation of caller inputs
- [x] Law citations on every exemption
- [x] Form 7000 field map included
- [x] Documented in this QA report

**Agent Y-007 signing off.**
