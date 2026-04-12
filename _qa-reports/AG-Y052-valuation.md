# AG-Y052 — Israeli Property Valuation Engine (מנוע הערכת שווי נדל"ן)

**Agent:** Y-052
**Swarm:** 3C — Real Estate
**Wave:** 2026
**Module:** `onyx-procurement/src/realestate/valuation.js`
**Tests:** `onyx-procurement/test/realestate/valuation.test.js`
**Status:** IMPLEMENTED — 86 / 86 passing
**Rule of the house:** לא מוחקים רק משדרגים ומגדלים — file never to be deleted, only enhanced.

---

## 1. Purpose

Implements the Israeli property valuation engine used by the Mega-ERP real-estate
module. Values land, apartments, houses, offices, retail, industrial, commercial,
and development sites using four canonical methods, with Israeli-specific factors
baked in on top. Zero external dependencies, bilingual Hebrew/English output,
pure functions, fully unit-tested.

Designed to be dropped into the מגה-ERP real-estate surface and called by:

- the owner self-service valuation wizard (UI flow — pick method + inputs)
- the appraiser workspace that cross-checks multiple methods side by side
- the betterment/purchase-tax engines for their שווי שוק inputs
- the internal asset register to re-value owned properties quarterly
- the procurement module when a property is considered for acquisition

---

## 2. Public API

```js
const {
  PropertyValuator,
  ADJUSTMENT_WEIGHTS,
  ISRAELI_FACTORS,
  NEIGHBORHOOD_INDEX_BASE,
  BANK_OF_ISRAEL_DEFAULT_RATE,
  CAP_RATE_BY_TYPE,
  DEPRECIATION_TABLES,
  VALUATION_METHOD_LABELS,
} = require('./src/realestate/valuation');

const v = new PropertyValuator({
  boiRate: 0.045,                  // Bank of Israel base rate
  asOfYear: 2026,
  comparablesFetcher: async (gush, helka, r) => fetchFromRashutHamisim(...),
});

const result = v.valuate(property, { method: 'comparable', inputs });
// → { low, likely, high, method, notes, breakdown, meta, methodLabel }
```

### `valuate(property, {method, inputs})`

Top-level dispatcher. Routes to one of the four method implementations, then
applies Israeli-specific factors uniformly. Returns:

| Key           | Meaning |
|---------------|---------|
| `low`         | Lower-bound estimate (ILS, integer) |
| `likely`      | Most-likely estimate (ILS, integer) |
| `high`        | Upper-bound estimate (ILS, integer) |
| `method`      | Method key used |
| `methodLabel` | `{he, en}` bilingual label |
| `notes[]`     | Array of `{he, en, impact}` describing each adjustment |
| `breakdown`   | Method-specific calculation detail |
| `meta`        | `{engine, version, currency, computedAt, asOfYear, boiRate}` |

### `comparableMethod({subject, comparables, adjustments})`

Sales-comparison approach. Each comparable is adjusted for:
size (via price-per-sqm), age, condition, location (distance), floor, and
amenities (elevator, parking, balcony, ממ"ד, storage). The likely value is
a mean/median blend of adjusted prices-per-sqm applied to the subject's size.

### `incomeMethod({rentalIncome, operatingExpenses, capRate, vacancy, growthRate, discountRate, holdYears, propertyType})`

Direct-cap and DCF parallel paths. If `capRate` is not supplied, the engine
auto-derives it from `CAP_RATE_BY_TYPE[propertyType]` and nudges it with the
Bank-of-Israel spread against the long-run average. Returns both figures in
the breakdown; `likely` is a weighted blend (60% direct-cap, 40% DCF).

### `costMethod({landValue, replacementCost, depreciation, yearBuilt, propertyType, condition})`

Land value plus replacement cost minus accumulated depreciation. Depreciation
is either supplied explicitly (absolute ILS or fraction) or calculated from
`yearBuilt` using straight-line over the useful life in `DEPRECIATION_TABLES`,
with an additional condition multiplier that accelerates or decelerates the
depreciation curve.

### `residualMethod({gdv, constructionCost, profit, finance, softCosts, contingency})`

Land-value backout for development sites:
`land = GDV − constructionCost − softCosts − contingency − profit − finance`.
Accepts both absolute ILS and fraction-of-GDV inputs. Returns zero (with a
warning note) when the residual is negative.

### `fetchComparables(gush, helka, radius)`

Stub for the Israeli Tax Authority real-estate-sales database (רשות המסים —
מחירי עסקאות נדל"ן). Returns an empty array with `_source`, `_note`, and
`_query` metadata attached, unless an injected `comparablesFetcher` is
supplied to the constructor — in which case that function is awaited.

### `getMsyOPIRate()`

Returns the Bank-of-Israel base rate that this valuator is using. In
production this would wrap a live BOI feed; the default snapshot for 2026 is
`BANK_OF_ISRAEL_DEFAULT_RATE = 0.045` (4.5%).

### `getBoiAdjustedCapRate(propertyType)`

Returns the cap rate for a property type, adjusted for the BOI spread:

```
cap = CAP_RATE_BY_TYPE[type] + (boiRate − 0.035) × 0.6
```

The `0.6` is the estimated beta of cap rates vs base rates. Floor at 2%.

### `neighborhoodIndex(city, neighborhood)`

Madlan-style micro-location multiplier. Lookup order:
`city|neighborhood` → `city|default` → global `default` (1.0).

---

## 3. Method formulas

### 3.1 Comparable (גישת ההשוואה)

```
For each comparable c:
  pricePerSqm_c  = c.salePrice / c.sizeSqm

  adjPpsm_c      = pricePerSqm_c
                 × (1 + ageDiff × agePerYear)           // age
                 × (subjCondMult / compCondMult)         // condition
                 × (1 − distance × distancePerKm)        // location
                 × (1 + floorDiff × floorPerLevel)       // floor
                 × (1 + Σ amenity_deltas)                // amenities

  // sanity clamp
  if |adjPpsm_c / pricePerSqm_c − 1| > maxAdjustmentAbs:
      adjPpsm_c = pricePerSqm_c × (1 ± maxAdjustmentAbs)

value_likely   = ((mean + median) / 2) × subject.sizeSqm
value_low      = min(adjPpsm) × subject.sizeSqm
value_high     = max(adjPpsm) × subject.sizeSqm
```

Weights (`ADJUSTMENT_WEIGHTS`):

| Weight            | Default | Meaning |
|-------------------|--------:|---------|
| `agePerYear`      |  0.005  | 0.5% per year difference |
| `ageCapYears`     |  40     | age diff clamp |
| `distancePerKm`   |  0.015  | 1.5% per km |
| `distanceCapKm`   |  6      | distance clamp |
| `floorPerLevel`   |  0.005  | 0.5% per floor |
| `floorCapLevels`  |  10     | floor-diff clamp |
| `elevator`        |  0.03   | 3% bump |
| `parking`         |  0.04   | 4% bump |
| `balcony`         |  0.02   | 2% bump |
| `safeRoom` (ממ"ד) |  0.025  | 2.5% bump |
| `storage`         |  0.01   | 1% bump |
| `maxAdjustmentAbs`|  0.5    | 50% total cap per comparable |

### 3.2 Income (גישת ההכנסות)

```
effectiveGross = rentalIncome × (1 − vacancy)
NOI            = effectiveGross − operatingExpenses

// Direct capitalisation
directCap      = NOI / capRate

// DCF with terminal value
for y in 1..holdYears:
    NOI_y = NOI × (1 + growthRate)^y
    PV_y  = NOI_y / (1 + discountRate)^y
terminalNOI    = NOI × (1 + growthRate)^(holdYears+1)
terminalValue  = terminalNOI / capRate
terminalPV     = terminalValue / (1 + discountRate)^holdYears
dcfValue       = Σ PV_y + terminalPV

likely         = 0.6 × directCap + 0.4 × dcfValue

// Sensitivity band
lowValue       = min(NOI / (capRate + 0.01), dcfValue × 0.9)
highValue      = max(NOI / (capRate − 0.01), dcfValue × 1.1)
```

When `capRate` is omitted, it is derived from
`getBoiAdjustedCapRate(propertyType)`.

### 3.3 Cost (גישת העלות)

```
if depreciation provided:
    depAmount = depreciation
else if yearBuilt provided:
    age              = max(0, asOfYear − yearBuilt)
    linearFraction   = min(age × table.annual, 1 − table.minValueFactor)
    // condition accelerates or decelerates
    condAdjusted     = clamp(linearFraction × (2 − conditionMultiplier), 0, 1 − minValueFactor)
    depAmount        = replacementCost × condAdjusted
else:
    depAmount        = 0

likely = landValue + (replacementCost − depAmount)
low    = likely × 0.90
high   = likely × 1.10
```

Useful-life table (`DEPRECIATION_TABLES`):

| Type        | Useful life | Floor value factor |
|-------------|------------:|-------------------:|
| apartment   |  80 years   |              0.30  |
| house       |  70 years   |              0.25  |
| office      |  50 years   |              0.25  |
| retail      |  50 years   |              0.25  |
| industrial  |  40 years   |              0.20  |
| commercial  |  50 years   |              0.25  |
| default     |  60 years   |              0.25  |

### 3.4 Residual (גישת השייר)

```
resolve(val, defaultFraction):
    if val is undefined:      return defaultFraction × GDV
    if val is a fraction ≤ 1: return val × GDV
    if val is absolute > 1:   return val
    if val = {amount}:        return val.amount
    if val = {fraction}:      return val.fraction × GDV

constructionAmt  = resolve(constructionCost)
softAmt          = resolve(softCosts,    default 0.08)
contAmt          = resolve(contingency,  default 0.05)
profitAmt        = resolve(profit,       default 0.17)
financeAmt       = resolve(finance,      default 0.05)

residual         = GDV − constructionAmt − softAmt − contAmt − profitAmt − financeAmt

// Sensitivity: GDV ±5%, construction ±10%
lowResidual      = (GDV × 0.95) − (constructionAmt × 1.10 + softAmt + contAmt + profitAmt + financeAmt)
highResidual     = (GDV × 1.05) − (constructionAmt × 0.90 + softAmt + contAmt + profitAmt + financeAmt)

// Negative residuals are clamped to 0 with a warning note.
```

Defaults are calibrated for typical Israeli mid-rise residential projects
and can be overridden per-call.

---

## 4. Israeli-specific factors — applied by every method

Every method routes through `_applyIsraeliFactors` before returning, so the
same modifier table applies uniformly whether the base calculation came from
comparables, income, cost, or residual. The modifier is multiplicative on
`likely`, and widens the `[low, high]` band by the factor's `rangeSpread`.

### 4.1 Tabu (טאבו) — legal registration status

| Status         | Factor | Band Δ | Hebrew                                       |
|----------------|-------:|-------:|----------------------------------------------|
| `clean`        |  1.00  |  0.00  | רישום נקי בטאבו                              |
| `mortgaged`    |  0.99  |  0.01  | משכנתא רשומה — ניתן לפירעון                   |
| `liens`        |  0.93  |  0.04  | עיקולים / שעבודים                            |
| `shared`       |  0.92  |  0.03  | בעלות משותפת (מושאע)                          |
| `unregistered` |  0.85  |  0.06  | לא רשום בטאבו (רמ"י / חברה משכנת)              |
| `defective`    |  0.70  |  0.10  | רישום פגום — דורש תיקון                        |

### 4.2 דייר מוגן (preserved tenant — חוק הגנת הדייר)

Present: **0.55 factor** (45% value cut) with `rangeSpread = 0.10`. This is
the biggest single downward adjustment the engine applies, reflecting the
reality that Israeli preserved-tenant apartments trade at roughly half of
vacant-possession value on the secondary market.

### 4.3 סכסוך ועד בית (building-committee dispute)

Present: **0.97 factor** (3% value cut). A moderate adjustment — the dispute
itself rarely destroys value but signals latent maintenance and legal costs.

### 4.4 תמ"א 38 — Israeli earthquake-retrofit plan

| Phase / State          | Factor | Band Δ | Meaning |
|------------------------|-------:|-------:|---------|
| `none`                 |  1.00  |  0.00  | No potential |
| `phase1Potential`      |  1.05  |  0.03  | תמ"א 38/1 potential (strengthening) |
| `phase1Signed`         |  1.10  |  0.04  | Phase 1 signed with developer |
| `phase1PermitIssued`   |  1.15  |  0.05  | Phase 1 building permit issued |
| `phase2Potential`      |  1.15  |  0.05  | תמ"א 38/2 potential (demolish & rebuild) |
| `phase2Signed`         |  1.22  |  0.06  | Phase 2 signed with developer |
| `phase2PermitIssued`   |  1.30  |  0.07  | Phase 2 building permit issued |

Precedence: **Phase 2 > Phase 1**, and within each phase
**permit > signed > potential**.

### 4.5 פינוי בינוי (evacuation-reconstruction)

| State       | Factor | Band Δ |
|-------------|-------:|-------:|
| `none`      |  1.00  |  0.00  |
| `eligible`  |  1.10  |  0.05  |
| `approved`  |  1.20  |  0.06  |

### 4.6 Neighborhood index — Madlan-style

Baseline micro-location multipliers for 30+ city/neighborhood combinations
across Tel Aviv, Jerusalem, Haifa, the Sharon, coastal centre, and the
periphery. Exposed via `PropertyValuator#neighborhoodIndex(city, neighborhood)`
and applied automatically when `property.city` is present. Fallback chain:
exact match → `city|default` → global `default`.

Examples:

| City / Neighborhood           | Index |
|-------------------------------|------:|
| תל אביב / לב תל אביב           |  1.60 |
| תל אביב / נווה צדק             |  1.65 |
| תל אביב / default              |  1.40 |
| הרצליה / הרצליה פיתוח          |  1.80 |
| ירושלים / רחביה                |  1.40 |
| חיפה / כרמל                    |  1.00 |
| באר שבע / default              |  0.60 |
| דימונה / default               |  0.45 |

### 4.7 Bank of Israel rate influence

The BOI base rate influences every income-method valuation through
`getBoiAdjustedCapRate`. When BOI rises, cap rates widen and values fall;
when BOI drops, cap rates compress and values rise. The beta is `0.6` — a
conservative estimate that matches the long-run observed relationship
between Israeli cap rates and the 10-year government bond yield. 2026
default rate: `BANK_OF_ISRAEL_DEFAULT_RATE = 0.045` (4.5%).

---

## 5. Test coverage

```
Suite: valuation.test.js
┌───────────────────────────────────────────────────────────────┐
│ 12 describes, 86 tests, all passing                            │
├───────────────────────────────────────────────────────────────┤
│ constants                      → rates, factors, labels        │
│ internal helpers               → round, clamp, cond/cap lookup │
│ comparableMethod               → size, age, condition, loc,    │
│                                  floor, amenities, cap, median │
│ incomeMethod                   → direct cap, vacancy, OPEX,    │
│                                  DCF growth, auto-cap, errors  │
│ costMethod                     → core, explicit dep, fraction, │
│                                  age dep, condition, min floor│
│ residualMethod                 → GDV backout, negative warn,   │
│                                  defaults, absolute amounts    │
│ Israeli factors                → tabu, דייר מוגן, ועד בית,     │
│                                  תמ"א 38 tiers, פינוי בינוי    │
│ neighborhoodIndex              → exact / city / global default │
│ fetchComparables               → stub + injected fetcher       │
│ Bank of Israel rate integration→ getMsyOPIRate, cap adjustment │
│ valuate() dispatcher           → routes all 4, errors, band    │
│ end-to-end                     → Tel Aviv apt, office DCF,     │
│                                  TAMA 38/2 residual            │
└───────────────────────────────────────────────────────────────┘
```

Run locally:
```bash
cd onyx-procurement
node --test test/realestate/valuation.test.js
```

Final run: **86 pass / 0 fail / 0 skip**.

---

## 6. Examples

### Example A — Tel Aviv apartment, comparable method

```js
const v = new PropertyValuator({ asOfYear: 2026, boiRate: 0.045 });

const subject = {
  city: 'תל אביב',
  neighborhood: 'פלורנטין',
  propertyType: 'apartment',
  sizeSqm: 80,
  yearBuilt: 1970,
  condition: 'average',
  floor: 3,
  tabuStatus: 'clean',
  tama38: { phase2: true, signed: true },
};

const comparables = [
  { salePrice: 2_400_000, sizeSqm: 75, yearBuilt: 1972, condition: 'average', distanceKm: 0.5 },
  { salePrice: 2_600_000, sizeSqm: 80, yearBuilt: 1975, condition: 'good',    distanceKm: 0.3 },
  { salePrice: 2_200_000, sizeSqm: 70, yearBuilt: 1968, condition: 'poor',    distanceKm: 0.7 },
];

const r = v.valuate(subject, { method: 'comparable', inputs: { comparables } });
// r.likely includes: comparables median × size × neighborhood 1.35 × TAMA 38/2 signed 1.22
// r.notes includes Hebrew mentions of "מדד שכונה" and 'תמ"א 38/2 חתום מול יזם'
```

### Example B — Office with income method under rising rates

```js
const v = new PropertyValuator({ boiRate: 0.055 });

const r = v.valuate(
  { city: 'תל אביב', propertyType: 'office', sizeSqm: 500 },
  {
    method: 'income',
    inputs: {
      rentalIncome: 600_000,
      operatingExpenses: 90_000,
      vacancy: 0.08,
    },
  },
);

// BOI 5.5% > long-run 3.5% → cap rate nudged from 6.5% toward ~7.7%
// r.breakdown.capRate > CAP_RATE_BY_TYPE.office
// r.likely drops accordingly
```

### Example C — Preserved tenant kills 45% of value

```js
const v = new PropertyValuator({ asOfYear: 2026 });

const r = v.valuate(
  {
    hasPreservedTenant: true,
    tabuStatus: 'clean',
  },
  {
    method: 'cost',
    inputs: { landValue: 1_000_000, replacementCost: 1_000_000, depreciation: 0 },
  },
);

// r.likely ≈ 1_100_000 (0.55 × 2_000_000)
// r.notes[i].he includes "דייר מוגן בנכס — הפחתה משמעותית בשווי (40%-50%)"
```

### Example D — Development site, residual method

```js
const v = new PropertyValuator();

const r = v.valuate(
  { city: 'רמת גן', tama38: { phase2: true, permitIssued: true } },
  {
    method: 'residual',
    inputs: {
      gdv: 30_000_000,
      constructionCost: 12_000_000,
      profit: 0.15,
      finance: 0.06,
      softCosts: 0.08,
      contingency: 0.04,
    },
  },
);

// residual = 30M - 12M - (0.15+0.06+0.08+0.04)*30M = 30M - 12M - 9.9M = 8.1M
// then × 1.15 (Ramat Gan default) × 1.30 (TAMA 38/2 permit)
```

---

## 7. Hebrew glossary (מילון מונחים)

| Hebrew term              | English / meaning                                             |
|--------------------------|---------------------------------------------------------------|
| הערכת שווי               | Property valuation / appraisal                                 |
| שמאי מקרקעין             | Licensed real-estate appraiser                                 |
| גישת ההשוואה             | Sales-comparison approach                                      |
| גישת ההכנסות             | Income-capitalization approach                                 |
| גישת העלות               | Cost approach                                                  |
| גישת השייר               | Residual method (land value backout)                           |
| שווי שוק                 | Market value                                                   |
| שווי לביטוח              | Insurance value                                                |
| עלות הקמה חלופית         | Replacement cost                                               |
| פחת                       | Depreciation                                                   |
| פחת פיזי                  | Physical depreciation                                          |
| פחת פונקציונלי           | Functional obsolescence                                        |
| פחת כלכלי / חיצוני        | Economic / external obsolescence                               |
| שיעור היוון              | Capitalization (cap) rate                                      |
| הכנסה שנתית נטו (NOI)   | Net operating income                                           |
| תפוסה / וקאנסי           | Occupancy / vacancy                                            |
| ערך פיתוח גולמי (GDV)   | Gross development value                                        |
| רווח יזם                 | Developer profit                                               |
| עלויות רכות              | Soft costs (design, permits, consultants)                      |
| בלתי צפוי / רזרבה         | Contingency                                                    |
| טאבו                     | Tabu — the Israeli land registry                               |
| מושאע                    | Undivided shared ownership                                     |
| רמ"י / חברה משכנת         | Israel Lands Authority / managing company — used when a parcel is not yet registered in tabu |
| דייר מוגן                | Preserved (protected) tenant under חוק הגנת הדייר               |
| חוק הגנת הדייר           | Tenant Protection Law                                          |
| ועד בית                   | Building committee                                             |
| סכסוך ועד בית            | Building committee dispute                                     |
| תמ"א 38                  | National Master Plan 38 — earthquake retrofit                  |
| תמ"א 38/1                | Phase 1 — structural strengthening, additional floors          |
| תמ"א 38/2                | Phase 2 — demolition and reconstruction                        |
| פינוי בינוי               | Evacuation-reconstruction (urban renewal) program              |
| גוש                       | Block (land-registry) number                                   |
| חלקה                     | Parcel number                                                  |
| תת-חלקה                  | Sub-parcel (individual apartment inside a building)            |
| ממ"ד                     | Protected/safe room (mamad)                                    |
| רשות המסים — מחירי עסקאות| Israeli Tax Authority real-estate sales database               |
| מדד מחירי דירות          | Housing price index (CBS)                                      |
| בנק ישראל                | Bank of Israel                                                 |
| ריבית בנק ישראל          | BOI base rate                                                  |

---

## 8. Integration notes

- **Bilingual throughout.** Every `note` object returned from the engine has
  both `he` and `en` keys so both Hebrew and English UIs can render directly.
- **Zero dependencies.** Pure CommonJS, no npm packages, no I/O except through
  the injected `comparablesFetcher` for live Tax-Authority data.
- **Pure functions.** The engine never mutates caller state. Each call
  returns a fresh object ready to be serialized to JSON, piped into a PDF
  renderer, or sent over the wire.
- **Integer rounding.** Values in `low`, `likely`, and `high` are integer
  shekels. Cap rates in `breakdown.capRate` preserve their full precision to
  make tests deterministic.
- **Composable.** The `inputs` parameter of `valuate()` mirrors the
  per-method signatures, so callers can switch methods without restructuring
  the rest of their code.
- **Betterment-tax compatible.** The engine is the natural upstream producer
  of the `sale` price input for `computeBettermentTax` (AG-Y007) and the
  purchase price input for `computePurchaseTax` (AG-Y008). Both tax engines
  consume the integer `likely` field directly.

---

## 9. Future enhancements (on upgrade path, NEVER deletion)

Per the house rule (לא מוחקים רק משדרגים ומגדלים), future work enhances this
module without touching existing behaviour:

| # | Enhancement | Status |
|---|-------------|--------|
| 1 | Live רשות המסים feed — wire `fetchComparables` to the real endpoint | pending |
| 2 | Live BOI rate feed — wire `getMsyOPIRate` to BOI public API | pending |
| 3 | Live Madlan / מדד מחירי דירות feed for `neighborhoodIndex` | pending |
| 4 | Auto-weighted multi-method reconciliation (weighted average of all 4) | pending |
| 5 | Risk-adjusted Monte Carlo — 10k scenario draws with cap/growth distributions | pending |
| 6 | Per-floor/view micro-adjustments (partial sea view, full sea view, green view) | pending |
| 7 | Rental comparable adjustments (currently income method takes rent as given) | pending |
| 8 | Integration with the asset register for quarterly auto-revaluation | pending |
| 9 | PDF renderer for the formal appraisal report (שומה) | pending |
| 10 | Persistence layer — store every valuation for audit trail | pending |
| 11 | Highest-and-best-use logic for mixed-use sites | pending |
| 12 | Support for commercial-ground-lease (חכירה ממנהל מקרקעי ישראל) value corrections | pending |

Every item is **additive**. The existing public API is frozen once this
module is merged; new features add new named exports or extend the returned
object with new keys.

---

## 10. Files

| Path | Purpose |
|------|---------|
| `onyx-procurement/src/realestate/valuation.js` | Engine (~900 LOC, zero deps) |
| `onyx-procurement/test/realestate/valuation.test.js` | Node test-runner unit tests |
| `_qa-reports/AG-Y052-valuation.md` | This report — never delete |

---

## 11. Sign-off

- [x] Code lints clean (no external deps, CommonJS, strict mode)
- [x] 86 / 86 tests passing
- [x] Bilingual output (Hebrew + English) on every note
- [x] Zero mutation of caller inputs
- [x] Israeli specifics: tabu, דייר מוגן, ועד בית, תמ"א 38, פינוי בינוי
- [x] Bank of Israel rate influence on cap rates
- [x] Madlan-style neighborhood index with fallback chain
- [x] `fetchComparables` stub for רשות המסים — מחירי עסקאות
- [x] All four methods (comparable, income, cost, residual) implemented
- [x] Integer `low / likely / high` output with `methodLabel` and `meta`
- [x] Documented in this QA report — file never to be deleted

**Agent Y-052 signing off.**
