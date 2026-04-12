# AG-Y060 — Real-Estate ROI Calculator

**Agent:** Y-060 (Swarm Real-Estate)
**Date:** 2026-04-11
**Project:** onyx-procurement (Kobi's mega-ERP for Techno-Kol Uzi — real-estate vertical)
**Rule of engagement:** לא מוחקים — רק משדרגים ומגדלים. This report is additive and never replaces prior work.
**Dependencies:** zero third-party (Node >= 18 built-ins only).

---

## 0. Executive summary

A pure financial kernel for real-estate underwriting that exposes the
twelve canonical metrics (cap rate, cash-on-cash, gross/net yield, NPV,
IRR, DSCR, LTV, break-even occupancy, holding-period DCF, sensitivity
matrix, Israeli after-tax return). The IRR solver is hybrid
Newton-Raphson with a bisection fallback, so it converges on
multiple-sign-change cashflow shapes (J-curve, mid-life capex). The
Israeli tax overlay models the three rental tracks (סעיף 122 flat 10%,
פטור 1990 exempt, שומה רגילה progressive) plus betterment tax (מס שבח)
on sale, including the linear-exempt split for primary residence.

| Item                                     | Status          |
|------------------------------------------|-----------------|
| Core module created                      | done            |
| Public API surface                       | 12 functions    |
| Israeli rental tracks (3)                | done            |
| Betterment tax + linear-exempt split     | done            |
| IRR Newton-Raphson + bisection fallback  | done            |
| Sensitivity matrix (2-way)               | done            |
| Test suite (`node:test`)                 | 44 cases, green |
| Hebrew RTL / bilingual labels            | done            |
| Zero third-party dependencies            | confirmed       |
| Files touched destructively              | none            |

---

## 1. Artefacts

| File                                                              | LOC  | Purpose                          |
|-------------------------------------------------------------------|-----:|----------------------------------|
| `onyx-procurement/src/realestate/roi-calculator.js`               | ~690 | main module (pure kernel)        |
| `onyx-procurement/test/realestate/roi-calculator.test.js`         | ~420 | 44 unit tests (`node --test`)    |
| `_qa-reports/AG-Y060-roi-calculator.md`                           |  —   | this report                      |

No existing files were altered. The `src/realestate/` directory already
existed (from `property-manager.js`, agent Y-046); this work is additive
alongside it. The `test/realestate/` directory was previously empty and
now contains its first test file.

---

## 2. Public API — 12 functions

```text
capRate(noi, propertyValue)                   → decimal
cashOnCash({annualCashFlow, totalCashInvested})
grossYield({annualRent, price})
netYield({annualRent, opex, price})
npv(cashflows[], discountRate)                → currency
irr(cashflows[], opts?)                       → decimal | NaN
dscr({noi, annualDebtService})                → ratio
ltv({loan, value})                            → decimal
breakEvenOccupancy({fixedCosts, varCostsPerOcc, rentPerUnit, units})
holdingPeriodAnalysis({...}) → full DCF struct (cashflows, IRR, NPV, EM)
sensitivity({baseCase, vary:{cap:[…], rent:[…]}}) → grid + flat
israeliAfterTaxReturn(preTax)                 → {track, rentalTax, betterment, …}
```

Plus exported constants:

```text
ISRAELI_RENTAL_FLAT_RATE            = 0.10
ISRAELI_BETTERMENT_INDIV_RATE       = 0.25
ISRAELI_BETTERMENT_COMPANY_RATE     = 0.23
ISRAELI_RENTAL_EXEMPT_CEILING_2026  = 5654 (ILS / month)
ISRAELI_TOP_MARGINAL_RATE           = 0.50
PASSIVE_BRACKETS_2026               = [ ...5 brackets... ]
LAW_CITATIONS                       = frozen map of Hebrew citations
```

---

## 3. Formulas

### 3.1 Basic ratios

| Metric                  | Formula                                                    | Unit    |
|-------------------------|------------------------------------------------------------|---------|
| Cap Rate / שיעור היוון  | `NOI / Value`                                              | decimal |
| Cash-on-Cash / תשואה על ההון | `AnnualCashFlow / TotalCashInvested`                  | decimal |
| Gross Yield / תשואה ברוטו | `AnnualRent / Price`                                    | decimal |
| Net Yield / תשואה נטו   | `(AnnualRent − Opex) / Price`                              | decimal |
| DSCR / יחס כיסוי חוב    | `NOI / AnnualDebtService`                                  | ratio   |
| LTV / יחס מימון לשווי   | `Loan / Value`                                             | decimal |

Where:

- **NOI** (Net Operating Income / הכנסה תפעולית נטו) = gross rent − operating expenses, before debt service and before income tax.
- **Opex** = management, maintenance, ארנונה, insurance, vacancy reserve.
- **Cash invested** = equity down-payment + closing costs + renovations + any equity-funded capex. Excludes mortgage principal.

### 3.2 NPV & IRR

**NPV** (Net Present Value / ערך נוכחי נקי):

```
NPV = Σ_{t=0..n} CF_t / (1 + r)^t
```

`CF_0` sits at `t=0` (usually negative — the initial outlay). `CF_i` at `t=i` for `i >= 1`.

**IRR** (Internal Rate of Return / תשואה פנימית):

```
IRR = r*  such that  NPV(cashflows, r*) = 0
```

Implementation:

1. Early return `NaN` if cashflows are all one sign (no IRR can exist).
2. **Newton-Raphson**: iterate `r ← r − f(r)/f'(r)` for up to 200 steps with `tol = 1e-7` on `|f(r)|`. Derivative is the analytical `−Σ t·CF_t / (1+r)^(t+1)`.
3. On non-convergence (derivative blow-up, multiple roots, J-curve patterns): **bisection fallback** scans a log-ish grid from `−0.99` to `99` to find a sign-change bracket, then bisects to `tol`.
4. Worst case: return `NaN` if no bracket is found — the caller should treat this as undefined IRR, never a crash.

### 3.3 Break-even occupancy / תפוסת איזון

```
BreakEven = FixedCosts / (Units × (RentPerUnit − VarCostPerOcc))
```

Returns `Infinity` when `VarCostPerOcc >= RentPerUnit` — each occupied unit still loses money, so no occupancy level will break even.

### 3.4 Holding-period DCF / ניתוח תקופת החזקה

For years `1..N`:

```
Rent_y    = AnnualRent    × (1 + rentGrowth)^(y−1)
Opex_y    = Year1Opex     × (1 + expenseGrowth)^(y−1)
NOI_y     = Rent_y − Opex_y
CF_y      = NOI_y − annualDebtService                     (y < N)
CF_N      = NOI_N − annualDebtService + SalePrice × (1 − saleCosts)
SalePrice = purchase × (1 + appreciation)^N
CF_0      = −(equity + closingCosts)
```

Then:

```
IRR               = irr([CF_0, CF_1, … , CF_N])
NPV               = npv([CF_0, … , CF_N], discountRate)
EquityMultiple    = Σ_{y>=1} CF_y / −CF_0
TotalReturn       = Σ_{y>=1} CF_y + CF_0
```

### 3.5 Sensitivity matrix / מטריצת רגישות

Two-way perturbation of appreciation and rent-growth inputs:

```
grid[i][j] = holdingPeriodAnalysis({
  ...baseCase,
  appreciation: base.appreciation + cap[i]/100,
  rentGrowth  : base.rentGrowth   + rent[j]/100,
})
```

Deltas are in **percentage points**, so `cap:[-1,0,1]` means `−1pp, 0, +1pp`. The output has both a nested `grid[i][j]` and a flat array for display in tables.

---

## 4. Israeli rental tax — three tracks explained

The module supports all three legal tracks for residential-rental taxation in Israel. The caller picks via `track: 'flat' | 'exempt' | 'regular'`.

### 4.1 Track 1: Flat 10% — **סעיף 122 לפקודת מס הכנסה**

- **Law:** סעיף 122 לפקודת מס הכנסה [נוסח חדש], התשכ"א-1961.
- **Rate:** 10% of gross rental income. **No deductions allowed** (no depreciation, no interest, no maintenance).
- **Who qualifies:** private individuals (not companies) renting out residential property. Commercial rent is excluded.
- **Filing:** separate track on the annual return. Must be paid within 30 days of the end of the calendar year (by 30-Jan).
- **Best for:** low-to-mid interest cost, low-depreciation (newer) properties. Very simple to compute.

**Example implementation:**

```js
israeliAfterTaxReturn({ annualRent: 60000, track: 'flat' })
// → { rentalTax: 6000, netRentalIncome: 54000, effectiveRentalRate: 0.10 }
```

### 4.2 Track 2: Total exemption — **חוק פטור 1990**

- **Law:** חוק מס הכנסה (פטור ממס על הכנסה מהשכרת דירת מגורים), התש"ן-1990.
- **Mechanic:** if gross monthly rent ≤ ceiling (≈ ₪5,654/mo for 2026, CPI-indexed), the entire rent is exempt. Above the ceiling, a linear phase-out applies: the exempt portion shrinks 1:1 as rent rises, and reaches zero at 2 × ceiling.
- **Who qualifies:** only residential property owned by an individual, and only if the renter uses the property as a residence.
- **Best for:** a single modestly-priced apartment.
- **Implementation:** above the ceiling, the module taxes the non-exempt portion at the **passive** progressive brackets (same as Track 3).

### 4.3 Track 3: Regular progressive — **סעיף 2(6)**

- **Law:** סעיף 2(6) לפקודת מס הכנסה — passive income schedule.
- **Mechanic:** taxable base = gross rent − operating expenses − mortgage interest − depreciation. Taxed at progressive **passive** brackets, which for Israel 2026 begin at **31%** (not 10% — those lower brackets are reserved for יגיעה אישית / earned income).
- **Best for:** highly-leveraged properties (large interest deduction), old buildings (depreciation), commercial rental.
- **Brackets used (default, override-able via `brackets:`):**

| Upper limit (ILS/yr) | Rate  |
|----------------------|------:|
| 254,760              | 31%   |
| 530,640              | 35%   |
| 721,560              | 47%   |
| Infinity             | 50%   |

### 4.4 Which track should the investor pick?

This is the classic Israeli landlord question — here is the quick heuristic:

| Scenario                                                        | Best track | Why                                |
|-----------------------------------------------------------------|-----------:|-----------------------------------|
| Single apartment, low rent (≤ ₪5,654/mo)                        | **exempt** | zero tax                           |
| Single apartment, medium rent, low mortgage interest            | **flat**   | 10% beats 31% net-of-deductions    |
| Highly leveraged, new building (big interest + depreciation)    | **regular**| deductions collapse the tax base   |
| Commercial rent                                                 | **regular**| Tracks 1 & 2 only apply to מגורים  |
| Multiple units where total rent > 2 × ceiling                   | **flat**   | exempt track provides no benefit   |

The module does not pick the optimal track automatically — that is the caller's call. Each track is deterministic and independently testable, so a smart wrapper can simply run all three and pick the minimum tax.

---

## 5. Betterment tax (מס שבח) on sale

**Law:** חוק מיסוי מקרקעין (שבח ורכישה), התשכ"ג-1963.

### 5.1 Simplified formula (nominal only)

```
NominalBetterment = SalePrice − PurchasePrice − Improvements − AllowableExpenses
BettermentTax     = NominalBetterment × Rate
```

**Rates:**

| Seller type            | Rate | Citation       |
|------------------------|-----:|----------------|
| Individual             |  25% | סעיף 48א(ב)   |
| Company                |  23% | סעיף 48א(א)   |

If `NominalBetterment <= 0` (sold at a loss) → zero tax, zero taxable base.

### 5.2 Linear-exempt split (primary residence)

**Law:** סעיף 48א(ב1) — the linear calculation for דירת מגורים מזכה.

For a qualifying primary residence held across the 2014-01-01 boundary, the betterment is split linearly by holding days:

- Pre-2014 share → **exempt** (0% tax)
- Post-2014 share → taxed at the individual rate (25%)

The module takes `holdYears` and `preSplitYears` (years before 2014-01-01) and computes:

```
ExemptShare  = preSplitYears / holdYears
TaxableShare = 1 − ExemptShare
TaxableAmt   = NominalBetterment × TaxableShare
Tax          = TaxableAmt × 0.25
```

This is a **simplification** of the full law — it does not yet do:

- CPI adjustment (שבח ריאלי) per סעיף 47 — pass `improvements` / `expenses` already index-adjusted if you need this.
- 4-year cool-down (תקופת צינון) per סעיף 49ב(1).
- Elderly / disability rate reductions per סעיף 48א(ב).
- Full form מש"ח (טופס 7000) fields.

These are already handled in `src/tax/betterment-tax.js` (agent Y-007) — the ROI calculator intentionally keeps the overlay thin and delegates full compliance to the specialized module.

---

## 6. Hebrew glossary (מונחון)

| Hebrew                      | Transliteration       | English                                      |
|-----------------------------|-----------------------|----------------------------------------------|
| שיעור היוון                 | shi'ur hivun          | Capitalization rate                          |
| תשואה על ההון העצמי         | tshua al ha-hon       | Cash-on-cash return                          |
| תשואה ברוטו                 | tshua bruto           | Gross yield                                  |
| תשואה נטו                   | tshua neto            | Net yield                                    |
| תשואה פנימית                | tshua pnimit          | Internal rate of return (IRR)                |
| ערך נוכחי נקי               | erech nochchi naki    | Net present value (NPV)                      |
| יחס כיסוי חוב               | yachas kisuy chov     | Debt service coverage ratio (DSCR)           |
| יחס מימון לשווי             | yachas mimun le-shovi | Loan-to-value (LTV)                          |
| תפוסת איזון                 | tfusat izun           | Break-even occupancy                         |
| מטריצת רגישות               | matricat regishut     | Sensitivity matrix                           |
| הכנסה תפעולית נטו (NOI)     | hachnasa tif'ulit     | Net operating income                         |
| הוצאות תפעוליות             | hotza'ot tif'uliyot   | Operating expenses (opex)                    |
| שירות חוב                   | sherut chov           | Debt service (P+I)                           |
| הון עצמי                    | hon atzmi             | Equity                                       |
| מימון                       | mimun                 | Financing / leverage                         |
| תקופת החזקה                 | tkufat hachzaka       | Holding period                               |
| ארנונה                      | arnona                | Municipal property tax                       |
| שכר דירה / שכ"ד             | schar dira            | Rent                                         |
| דירת מגורים מזכה            | dirat megurim mezaka  | Qualifying primary residence                 |
| מס שבח                      | mas shevach           | Betterment tax                               |
| שבח נומינלי                 | shevach nominali      | Nominal betterment                           |
| שבח ריאלי                   | shevach real-i        | Real (CPI-adjusted) betterment               |
| פטור                        | ptor                  | Exemption                                    |
| מדרגות מס                   | madregot mas          | Tax brackets                                 |
| מס יסף                      | mas yesef             | Surtax (3% over high-income threshold)       |
| סעיף 122 מסלול 10%          | sa'if 122             | Section 122 — flat 10% rental track          |
| פטור 1990                   | ptor 1990             | 1990 exempt-rental track                     |
| מסלול רגיל                  | maslul ragil          | Regular progressive track                    |

---

## 7. Test results

Command:

```bash
node --test test/realestate/roi-calculator.test.js
```

Output summary:

```
ℹ tests 44
ℹ suites 0
ℹ pass 44
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~150
```

### 7.1 Test inventory by section

| Section                                  | # tests |
|------------------------------------------|--------:|
| Cap rate                                 | 4       |
| Cash-on-cash                             | 3       |
| Gross / net yield                        | 3       |
| NPV                                      | 4       |
| IRR (convergence)                        | 7       |
| DSCR                                     | 3       |
| LTV                                      | 2       |
| Break-even occupancy                     | 2       |
| Holding-period DCF                       | 2       |
| Sensitivity matrix                       | 2       |
| Israeli after-tax — flat 10%             | 2       |
| Israeli after-tax — exempt track         | 2       |
| Israeli after-tax — regular track        | 1       |
| Israeli after-tax — betterment           | 4       |
| Integration (TLV 3BR underwrite)         | 1       |
| Law citations sanity                     | 1       |
| Error-path / guard tests                 | 1       |
| **Total**                                | **44**  |

### 7.2 IRR convergence evidence

- Vanilla single-sign-change: `[-1000, 1100]` → `0.10` exactly.
- 5-year annuity: `[-1000, 250, 250, 250, 250, 250]` → `0.0793083` (matches `RATE()` in Excel to 5 decimals).
- Terminal-sale shape: `[-2M, 150K, 160K, 170K, 180K, 2.6M]` → converges, `NPV(IRR) < 0.5` (basically zero).
- J-curve with mid-life capex: `[-1000, 500, -300, 800, 1200]` → converges, `NPV(IRR) < 0.5` — **this is the case where Newton-Raphson alone tends to diverge**; the bisection fallback is what saves us.
- All-positive: `[100, 200, 300]` → `NaN` (no IRR can exist).
- All-negative: `[-100, -200, -300]` → `NaN`.
- Deep-loss: `[-1000, 200, 200, 100]` → negative IRR, still satisfies `NPV(IRR) ≈ 0`.

### 7.3 Israeli flat-10% evidence

```js
israeliAfterTaxReturn({ annualRent: 60_000, track: 'flat' })
// → { rentalTax: 6000, netRentalIncome: 54000, effectiveRentalRate: 0.10 }

israeliAfterTaxReturn({ monthlyRent: 5_000, track: 'flat' })
// → grossRentAnnual: 60000, rentalTax: 6000
```

Citation `סעיף 122 לפקודת מס הכנסה` is present in the output `citations[]`.

### 7.4 Betterment evidence

Nominal betterment 450K → 25% → 112,500 ILS (individual seller).
Loss scenario (sold for 1.8M after buying for 2M) → zero tax, zero taxable.
Linear-exempt for 20-year hold with 10 pre-2014 years → 50% exempt, taxable 500K of 1M nominal, tax 125K.

### 7.5 Sensitivity matrix evidence

`3×3` grid with `cap:[-1,0,1], rent:[-5,0,5]` returns 9 cells, center cell `(0,0)` exactly matches the base-case IRR, and IRR is monotonic-increasing in appreciation across cap-delta rows (as required for a sanity-checked model).

---

## 8. Limitations & future upgrades (upgrade queue, never deletes)

| #  | Gap                                                       | Proposed next step                                |
|----|-----------------------------------------------------------|---------------------------------------------------|
| 1  | No CPI adjustment in the ROI module itself                | delegate to `src/tax/betterment-tax.js` for `indexByCpi()` |
| 2  | Israeli brackets hard-coded to passive schedule           | expose `makeBrackets(year)` + link to `tax-constants-2026.js` |
| 3  | Mortgage amortization not modeled                         | add `annuityPayment({P, r, n})` helper            |
| 4  | Monte-Carlo not included                                  | separate module, seeded RNG                       |
| 5  | Multi-currency                                            | FX overlay from `src/fx/`                         |
| 6  | Scenario comparison (tornado chart data)                  | lightweight wrapper over `sensitivity()`          |
| 7  | Property tax brackets (מס רכישה) on purchase              | link to `src/tax/purchase-tax.js` (already exists)|
| 8  | ROI on rehab-rent-refinance (BRRRR)                       | new function `brrrAnalysis()`                     |

All of these are **additions**, consistent with the house rule — none requires touching existing code.

---

## 9. Security, privacy, data

- Module is a pure kernel. No I/O, no network, no filesystem, no env.
- No PII processed. All inputs are monetary / numeric. No national-id, no names.
- Stateless: every call returns a fresh object; no module-level mutable state.
- Zero dependencies → no supply-chain surface.

---

## 10. Rule compliance — לא מוחקים רק משדרגים ומגדלים

- No files were deleted or rewritten.
- No existing exports were renamed or removed.
- No tests from other suites were modified.
- The file `src/realestate/property-manager.js` (agent Y-046) is untouched.
- The file `src/tax/betterment-tax.js` (agent Y-007) is untouched.
- The new module is strictly additive and complements both.

---

## 11. How to call it end-to-end

```js
const ROI = require('./src/realestate/roi-calculator');

// Underwrite a ₪3M Tel-Aviv 3BR apartment, 30% down, 25-year mortgage
const price       = 3_000_000;
const annualRent  = 9_000 * 12;    // ₪108K
const annualOpex  = 1_000 * 12;    // ₪12K
const noi         = annualRent - annualOpex;  // ₪96K
const equity      = 0.30 * price;  // ₪900K
const loan        = 0.70 * price;  // ₪2.1M
const debtService = 149_017;       // annuity at 5% over 25y

// ── Basic ratios ──
ROI.capRate(noi, price);                          // 0.032
ROI.grossYield({ annualRent, price });            // 0.036
ROI.netYield({ annualRent, opex: annualOpex, price }); // 0.032
ROI.ltv({ loan, value: price });                  // 0.70
ROI.dscr({ noi, annualDebtService: debtService }); // 0.644 (under-levered!)
ROI.cashOnCash({
  annualCashFlow: noi - debtService,
  totalCashInvested: equity,
});                                               // -0.059

// ── Full 10-year hold DCF ──
const hp = ROI.holdingPeriodAnalysis({
  purchase: price,
  equity,
  closingCosts: 60_000,  // ~2% mas rechisha + legal + brokerage
  annualRent,
  year1Opex: annualOpex,
  rentGrowth: 0.03,
  expenseGrowth: 0.02,
  appreciation: 0.04,
  saleCosts: 0.05,
  holdYears: 10,
  discountRate: 0.06,
  annualDebtService: debtService,
});
console.log(hp.irr, hp.npv, hp.equityMultiple);

// ── Sensitivity ──
const sens = ROI.sensitivity({
  baseCase: hp,   // note: use the raw input shape or the same input
  vary: { cap: [-2, -1, 0, 1, 2], rent: [-5, 0, 5] },
});

// ── Apply Israeli tax ──
const flat = ROI.israeliAfterTaxReturn({
  annualRent,
  track: 'flat',
  sale: { purchase: price, price: hp.salePrice, isIndividual: true },
});
console.log(flat.rentalTax);          // 10_800 (= 108K × 10%)
console.log(flat.betterment.tax);     // (salePrice − price) × 25%
```

---

## 12. Sign-off

- **Agent:** Y-060
- **Wave:** 2026 Real-Estate Swarm
- **Status:** green — 44/44 tests pass
- **Next handshake:** caller can wire this into any underwriting UI, a
  Wix/Next dashboard, or a PDF generator without additional plumbing —
  it has no async surface and no state.

**Never delete. Always grow.** (לא מוחקים — רק משדרגים ומגדלים.)
