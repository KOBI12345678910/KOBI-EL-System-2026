# AG-X34 — Fixed Asset Management & Depreciation Engine

**Agent:** X-34
**Swarm:** 3B
**System:** Techno-Kol Uzi mega-ERP (Kobi Elimelech, 2026)
**Date:** 2026-04-11
**Status:** COMPLETE — 32/32 tests passing

---

## 1. Scope

Build a zero-dependency, bilingual (Hebrew/English) fixed-asset register and
depreciation engine for the Techno-Kol Uzi ERP. The module must:

1. Track fixed assets with full audit trail (never delete).
2. Compute depreciation using Israeli statutory rates (תקנות מס הכנסה פחת).
3. Support all five standard depreciation methods.
4. Auto-post general-ledger entries.
5. Handle disposal, transfer, revaluation, impairment, physical audit.
6. Forecast future NBV.
7. Pass a ≥20-case test suite with real math.

---

## 2. Deliverables

| File | Purpose |
|------|---------|
| `onyx-procurement/src/assets/asset-manager.js` | Engine (~720 LOC, zero deps) |
| `test/payroll/asset-manager.test.js` | 32 test cases, `node --test` |
| `_qa-reports/AG-X34-asset-management.md` | This report |

All files are append-only. The engine never deletes state — disposed assets
transition to `status: 'DISPOSED'` and remain in the register forever, with a
full transaction trail.

---

## 3. Israeli Depreciation Rate Catalog (תקנות פחת)

| Category (EN) | Category (HE) | Annual Rate | Useful Life |
|---|---|---|---|
| Residential building | מבנה מגורים | 4% | 25 |
| Office building | מבנה משרדים | 4% | 25 |
| Industrial building (accelerated) | מבנה תעשייתי | **8%** | 12.5 |
| General machinery | מכונות וציוד כללי | 15% | 6.67 |
| Heavy equipment | ציוד כבד | **20%** | 5 |
| Computers & peripherals | מחשבים וציוד היקפי | 33% | 3 |
| Mobile phones | טלפונים סלולריים | **50%** | 2 |
| Software licenses | תוכנה | 33% | 3 |
| Private vehicle | רכב פרטי | 15% | 6.67 |
| Truck | משאית | 20% | 5 |
| Office furniture (standard) | ריהוט משרדי | 6% | 16.67 |
| Office furniture (accelerated) | ריהוט משרדי (מואץ) | 15% | 6.67 |
| Hand & power tools | כלי עבודה | 25% | 4 |

Source: תקנות מס הכנסה (פחת), תשל"א-1941, לוח א' (schedule A) and subsequent
ministry of finance updates through 2026.

---

## 4. Depreciation Methods Implemented

1. **Straight-line** (`STRAIGHT_LINE`) — default, `(cost - salvage) / life`
2. **Double-declining balance** (`DECLINING_BALANCE`) — `NBV × (2/life)`, clamps at salvage
3. **Sum-of-years-digits** (`SUM_OF_YEARS`) — `((life - y + 1) / SYD) × (cost - salvage)`
4. **Units of production** (`UNITS_OF_PRODUCTION`) — `(cost - salvage) × (units / total)`
5. **Accelerated** (`ACCELERATED`) — uses category's legal max rate directly

All methods respect the salvage-value floor — NBV can never drop below
`salvage_value`.

---

## 5. Feature Checklist (all implemented)

| # | Feature | Implementation |
|---|---------|----------------|
| 1 | Monthly depreciation w/ auto GL posting | `runDepreciation(asOf)` — posts `7200-DEP-EXP` / `1590-ACC-DEP` journal |
| 2 | Mid-month convention | `monthsBetweenMidMonth()` — acquired ≤ 15th = full, > 15th = half |
| 3 | Partial-year (first / last) | Pro-rata by months since `last_depreciated_to` |
| 4 | Disposal with gain/loss | `dispose()` — computes `sale - NBV`, posts full 4-line journal |
| 5 | Impairment test (IAS 36) | `impairmentTest(id, recoverable)` — writes down if `recoverable < carrying` |
| 6 | Transfer between locations | `transfer(id, loc, custodian)` — appends TRANSFER tx |
| 7 | Revaluation (IAS 16) | `revalue(id, fv)` — updates `revaluation_surplus` |
| 8 | Physical count / audit | `auditReport(counts)` — returns `MISSING`, `LOCATION_MISMATCH`, `GHOST` |
| 9 | Barcode tagging | `generateBarcode(id)` — deterministic, Code-128 compatible |
| 10 | 5-year depreciation forecast | `forecast(id, years)` — method-aware NBV projection |

---

## 6. Data Model

```
Asset {
  id, name, name_he, category, category_he, category_en,
  serial_no, location, custodian,
  acquisition_date, cost, salvage_value, useful_life_years,
  depreciation_method, depreciation_rate,
  accumulated_depreciation, current_nbv,
  status: ACTIVE | DISPOSED,
  barcode,
  revaluation_surplus, impairment_loss,
  total_units_capacity, units_used,
  last_depreciated_to,
  disposal_date?, disposal_proceeds?, disposal_gain_loss?
}

Transaction types: ACQUIRE | DEPRECIATE | IMPAIR | DISPOSE | REVALUE | TRANSFER
                   (HE: רכישה | פחת | ירידת ערך | מימוש | הערכה מחדש | העברה)

Journal entries: debit / credit pairs, tied to GL accounts:
   7200-DEP-EXP    הוצאות פחת
   1590-ACC-DEP    פחת שנצבר
   1500-FA         רכוש קבוע
   1000-CASH       מזומן
   4900-GAIN-FA    רווח ממימוש רכוש קבוע
   7900-LOSS-FA    הפסד ממימוש רכוש קבוע
   7910-IMP-LOSS   הפסד מירידת ערך
```

---

## 7. Public API

```js
const m = require('./onyx-procurement/src/assets/asset-manager.js');

m.addAsset(fields)                      // → string id
m.runDepreciation(asOf, opts)           // → entries[]
m.dispose(assetId, saleAmount, date)    // → { gain_loss, journal }
m.transfer(assetId, newLoc, custodian)  // → void
m.forecast(assetId, years)              // → [{ year, depreciation, accumulated, nbv }]
m.impairmentTest(assetId, recoverable)  // → { impaired, adjustment, carrying, recoverable }
m.auditReport(countMap)                 // → unreconciled[]
m.categorySummary()                     // → aggregate totals per category

// For multi-tenant / test isolation:
m.createAssetStore()                    // → a fresh, isolated store
```

---

## 8. Test Results

```
Runner:   node --test
File:     test/payroll/asset-manager.test.js
Count:    32 tests (≥20 required)
Passed:   32
Failed:   0
Duration: ~191 ms
```

### Test Coverage Map

| # | Case | Scope |
|---|------|-------|
| 1 | catalog completeness | 12 Israeli categories |
| 2 | rates match ITA | 4%, 8%, 15%, 20%, 33%, 50%, 25%, 6% |
| 3 | straight-line math | 3 scenarios |
| 4 | declining-balance math | year 1, year 2, salvage clamp |
| 5 | sum-of-years math | SYD factor for year 1/2/5 |
| 6 | units-of-production | normal + zero-total guard |
| 7 | addAsset happy path | store + barcode + bilingual |
| 8 | addAsset invalid category | throws |
| 9 | addAsset invalid fields | cost/-date/salvage>cost |
| 10 | default useful life | category inheritance |
| 11 | mid-month ≤15 | full-month convention |
| 12 | mid-month >15 | half-month convention |
| 13 | computer 33% | full year NBV/accum |
| 14 | heavy equipment 20% | 5-year life |
| 15 | mobile phone 50% | 2-year full write-off |
| 16 | building 8% | industrial accelerated |
| 17 | dispose GAIN | sale > NBV |
| 18 | dispose LOSS | sale < NBV |
| 19 | transfer | location + custodian + tx |
| 20 | revaluation | IAS 16 surplus |
| 21 | impairment triggered | IAS 36 write-down |
| 22 | impairment not triggered | no change |
| 23 | forecast 5 years | straight-line |
| 24 | forecast DDB | salvage floor preserved |
| 25 | audit missing/mismatch/ghost | full 3-way reconcile |
| 26 | category summary | aggregate totals |
| 27 | barcode | deterministic |
| 28 | never-delete | disposed asset stays |
| 29 | accumulated cap | ≤ (cost - salvage) |
| 30 | store isolation | `createAssetStore()` |
| 31 | GL journal posting | debit/credit balance |
| 32 | Hebrew labels | category_he + type_he |

---

## 9. Compliance

- **תקנות מס הכנסה (פחת)** — all statutory rates encoded in `CATEGORY_RATES`.
- **IAS 16** — `revalue()` maintains a `revaluation_surplus` on the asset.
- **IAS 36** — `impairmentTest()` implements carrying vs recoverable.
- **IFRS 5** — `dispose()` transitions status to `DISPOSED` and posts full journal.
- **Hebrew accounting standards** — Hebrew labels on every category, transaction,
  and journal account name. All amounts in NIS.
- **Zero-dependency rule** — module requires only `node:test` and `node:assert`
  from the Node standard library.
- **Never-delete rule** — verified by test #28. All state mutations are
  append-only transactions.

---

## 10. Files

| Path | LOC |
|------|-----|
| `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\assets\asset-manager.js` | ~720 |
| `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\test\payroll\asset-manager.test.js` | ~520 |
| `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-X34-asset-management.md` | (this file) |

---

## 11. Sign-off

- [x] All required categories implemented with correct Israeli rates
- [x] All 5 depreciation methods coded and tested
- [x] Monthly + mid-month + partial year conventions
- [x] Disposal, transfer, revaluation, impairment, audit, forecast
- [x] GL journal auto-posting (debit exp / credit accum)
- [x] 32/32 tests passing (>20 required)
- [x] Zero external dependencies
- [x] Hebrew bilingual throughout
- [x] Never-delete rule enforced

**Agent X-34 — Swarm 3B — cleared for merge.**
