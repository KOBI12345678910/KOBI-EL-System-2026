# AG-Y076 — Fixed Asset Register & Depreciation Engine

**Agent:** AG-Y076
**Swarm:** 4B — Finance Core
**Wave:** 2026
**Date:** 2026-04-11
**Project:** Techno-Kol Uzi Mega-ERP (Kobi EL)
**Module file:** `onyx-procurement/src/finance/fixed-assets.js`
**Test file:**  `onyx-procurement/test/finance/fixed-assets.test.js`
**Rule of engagement:** לא מוחקים רק משדרגים ומגדלים — append-only ledger, never destructive.

---

## 1. Scope

Production-grade Fixed Asset Register (מרשם רכוש קבוע) with full Israeli
tax-compliant depreciation, disposal accounting (integrated with Agent Y-006
capital-gains engine), IAS 16 revaluation, IAS 36 impairment testing,
intra-company transfers, full-life schedule projection, and CAPEX reporting.

**Zero external dependencies** — pure Node / pure JS, browser-bundleable.
**Bilingual** — every user-facing label carries `{en, he}`.

---

## 2. Statutory & Accounting References

| Framework | Reference | Purpose |
| --- | --- | --- |
| Israeli Tax | תקנות מס הכנסה (פחת), תשמ"א-1991 — לוחות א' ו-ב' | Annual SL rates |
| Israeli Tax | פחת מואץ — תקנות מס הכנסה (פחת מואץ לציוד) | Accelerated track (industrial/solar) |
| Israeli Tax | פקודת מס הכנסה §88–101 | Capital gains on disposal (bridge to Y-006) |
| Israeli Tax | תקנות רכב צמוד | Private vehicle deduction restrictions |
| IFRS | IAS 16 — Property, Plant & Equipment | Revaluation model (equity surplus) |
| IFRS | IAS 36 — Impairment of Assets | Recoverable-amount test |
| IFRS | IFRS 5 — Non-current assets held for sale | Disposal classification |

---

## 3. Embedded Israeli Depreciation Table (תקנות פחת 1991 → 2026)

| Code | Hebrew | English | Rate | Range | Life (yrs) | Method | Salvage | Restricted | Statute |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BUILDING_NON_INDUSTRIAL` | מבנה רגיל (לא תעשייתי) | Building — non-industrial | **4%** | 4% | 25 | SL | 0% | — | לוח א' §1 |
| `BUILDING_INDUSTRIAL` | מבנה תעשייתי | Building — industrial | **8%** | 4-8% | 12.5 | SL | 0% | — | לוח א' §1(א) |
| `COMPUTERS` | מחשבים וציוד היקפי | Computers & peripherals | **33%** | 33% | 3 | SL | 0% | — | לוח ב' §1(א) |
| `DIGITAL_INFRASTRUCTURE` | תשתית דיגיטלית | Digital infra (servers, fiber, edge cloud) | **33%** | 25-33% | 3 | SL | 0% | — | לוח ב' §1(א) |
| `SOFTWARE` | תוכנה (רישיון רב-שנתי) | Software (multi-year license) | **33%** | 25-33% | 3 | SL | 0% | — | לוח ב' §1(ב) |
| `OFFICE_FURNITURE` | ריהוט משרדי | Office furniture | **6%** | 6-7% | 16.67 | SL | 0% | — | לוח א' §4 |
| `MACHINERY_GENERAL` | מכונות וציוד כללי | General machinery | **12%** | 10-15% | 8.33 | SL | 0% | — | לוח א' §2 |
| `MACHINERY_METAL_FAB` | מכונות חיתוך ועיבוד שבבי (CNC, לייזר, כרסומות) | Metal fabrication / CNC | **15%** | 10-20% | 6.67 | SL | 0% | — | לוח א' §2(ב) + פחת מואץ |
| `HEAVY_EQUIPMENT` | ציוד כבד (מנופים, באגרים) | Heavy equipment (cranes, excavators) | **20%** | 15-20% | 5 | SL | 5% | — | לוח א' §3 |
| `VEHICLE_COMMERCIAL` | רכב מסחרי (משא, טנדר) | Commercial vehicle (truck/van) | **15%** | 15-20% | 6.67 | SL | 10% | — | לוח א' §5(א) |
| `VEHICLE_PRIVATE` | רכב פרטי | Private passenger vehicle | **15%** | 15% | 6.67 | SL | 10% | **YES** — §31 & תקנות רכב צמוד (cap ~₪140k) | לוח א' §5(ב) |
| `SOLAR_INSTALLATION` | מתקן סולארי / פוטו-וולטאי | Solar / PV installation | **25%** | 20-25% | 4 | SL | 5% | — | פחת מואץ לאנרגיה מתחדשת |
| `DEFAULT_EQUIPMENT` | ציוד — ברירת מחדל | Equipment — fallback | **10%** | 10-15% | 10 | SL | 0% | — | לוח א' כללי |

All rate cells are sourced inline in `DEPRECIATION_CLASSES` (see
`src/finance/fixed-assets.js` § 1). Each entry carries `statuteRef`.

Hebrew aliases are accepted at the API boundary via `HEBREW_ALIASES`:
`מחשבים`, `מבנה`, `ריהוט משרדי`, `מכונות חיתוך`, `CNC`, `ציוד כבד`,
`רכב מסחרי`, `רכב פרטי`, `מתקן סולארי`, `תשתית דיגיטלית`, `תוכנה`, etc.

---

## 4. Depreciation Methods

### 4.1 Straight-Line — קו ישר (Israeli Tax default)

```
annual_expense = (cost - salvage) / usefulLifeYears
```

Pro-rated in the acquisition year by **months remaining** (12 − acquisition
month + 1) ÷ 12, consistent with Israeli Tax Authority guidance.

### 4.2 Double-Declining Balance (DDB / 200%) — פחת מואץ

```
annual_expense = NBV_open * (2 / life)
                 clipped so NBV never drops below salvage.
```

Used when management elects accelerated depreciation for book purposes (IAS
16) — Israeli tax accepts only the SL rate from the table for deductibility,
so DDB is tracked for book but the tax bridge always uses the SL column.

### 4.3 Sum-of-Years-Digits (SOYD) — סכום ספרות השנים

```
year_k_expense = (life - k + 1) / (life * (life + 1) / 2) * (cost - salvage)
```

Monotonically decreasing expense over life — year 1 > year 2 > … > year n.

### 4.4 Period handling

`computeDepreciation({period})` accepts either:

- `{from, to}` — explicit ISO window
- `{year, frequency: 'annual'|'quarterly'|'monthly', quarter, month}`

Pro-rata fraction is capped to 1.0; day-count uses actual/365. The first
computation after acquisition trims the window to start on the purchase
date (acquisition-date clipping).

---

## 5. Disposal — Gain/Loss & Y-006 Integration

`disposeAsset({assetId, date, proceeds, reason})` executes:

1. Catch-up depreciation to the disposal date (posted to the asset).
2. `gain_loss = proceeds − NBV_at_disposal`
3. Marks asset `status = 'disposed'` (never deleted).
4. Emits a `capitalGainsEvent` compatible with the Agent Y-006 shape
   (`src/tax/capital-gains.js → computeGain`):

```jsonc
{
  "source": "fixed-assets",
  "assetId": "FA-2026-00001",
  "assetDescription": "...",
  "depreciationClass": "MACHINERY_METAL_FAB",
  "acquisitionDate": "2024-01-01",
  "acquisitionCost": 450000,
  "sellDate": "2026-04-11",
  "sellPrice": 380000,
  "accumulatedDepreciation": 135000,
  "taxBasis": 315000,      // NBV = adjusted basis
  "nominalGain": 65000,
  "reason": "sale"
}
```

5. Returns a **balanced bilingual journal entry** (verified by test):

   | Account | DR | CR | Memo (HE) |
   |---|---|---|---|
   | `CASH/BANK` | proceeds | — | קבלת תמורה |
   | `ACCUM_DEPR:<class>` | accumulated | — | ביטול פחת נצבר |
   | `FA:<class>` | — | cost | גריעת עלות מקורית |
   | `GAIN_ON_DISPOSAL` or `LOSS_ON_DISPOSAL` | (loss side) | (gain side) | רווח/הפסד הון |

The Y-006 bridge is wired via the constructor option
`onCapitalGainsEvent: (ev) => {...}`. This lets the caller forward the
event to `tax/capital-gains.js` for nominal/inflationary/real-gain split,
linear-method allocation by rate-change date, and § 92 loss carry-forward.

---

## 6. Revaluation (IAS 16) & Impairment (IAS 36)

### 6.1 `revaluation(assetId, newValue)`

- Updates `netBookValue` and `costBasis` to the new fair value.
- `uplift = newValue − previousNBV` is **tracked in `revaluationSurplus`**
  (equity), not P&L.
- **Tax note:** the uplift is not deductible under Israeli tax. The Y-006
  capital-gains bridge continues to use the original cost (plus CPI
  inflation adjustment) — not the revalued amount.

### 6.2 `impairmentTest(assetId, {recoverableAmount, indicators})`

- If `recoverableAmount < NBV`: writes down the asset, accumulates
  `impairmentLoss`, returns a P&L-charge recommendation.
- If only `indicators[]` provided (e.g. `idle`, `market_drop`): returns a
  "calculate recoverable amount and re-test" recommendation without
  mutating the asset.
- Indicators supported (free-form but conventionally):
  - `physical_damage` — נזק פיזי
  - `technological_obsolescence` — שינוי טכנולוגי
  - `market_drop` — ירידה במחיר שוק
  - `idle` — השבתה
  - `discontinued_operation` — הפסקת פעילות

---

## 7. Transfers & CAPEX Reporting

### 7.1 `handleTransfer(assetId, newLocation, opts)`

- Appends a transfer record `{date, fromLocation, toLocation, custodian, reference}`.
- Updates `location` on the master record.
- **Refuses on disposed assets** (verified by test).
- Full transfer history stays queryable via `history(assetId)`.

### 7.2 `capexReport({year} | {from, to})`

- Aggregates all assets acquired in the window.
- Returns `{totals, byCategory, items}`:
  - `totals.cost`, `totals.vat`, `totals.count`
  - `byCategory[class].cost` + `count`
- Useful for Board CAPEX review (דו"ח השקעות הון).

---

## 8. Append-Only Audit Trail (history)

Every mutation appends an event to `_history`:

| Kind | Trigger |
| --- | --- |
| `ACQUIRE` | `acquireAsset()` |
| `DEPRECIATE` | `computeDepreciation({post:true})` |
| `REVALUE` | `revaluation()` |
| `IMPAIR` | `impairmentTest({recoverableAmount})` with write-down |
| `TRANSFER` | `handleTransfer()` |
| `DISPOSE` | `disposeAsset()` |

`history(assetId)` returns the full ordered event stream for an asset, or
the global stream when called without an argument. This satisfies the
"לא מוחקים, רק מוסיפים" rule — the disposal event never removes the
underlying asset record; the record persists with `status: 'disposed'`
and the full before/after state is reconstructable from the log.

---

## 9. Hebrew Glossary (מילון מונחים)

| Hebrew | Transliteration | English |
| --- | --- | --- |
| רכוש קבוע | Rechush Kavua | Fixed asset / PP&E |
| מרשם רכוש קבוע | Mirsham Rechush Kavua | Fixed asset register |
| פחת | Pachat | Depreciation |
| פחת בקו ישר | Pachat be-Kav Yashar | Straight-line depreciation |
| פחת מואץ | Pachat Meʼutz | Accelerated depreciation (DDB) |
| סכום ספרות השנים | Schum Sifrot ha-Shanim | Sum-of-years-digits |
| תקנות מס הכנסה (פחת) | Takanot Mas Hachnasa (Pachat) | Income Tax Regs (Depreciation) |
| לוח א' / לוח ב' | Luach Aleph / Luach Bet | Schedule A / Schedule B |
| עלות מקורית | Alut Mekorit | Original cost |
| עלות מופחתת | Alut Mufchetet | Depreciated cost / NBV |
| ערך בספרים נטו | Erech ba-Sfarim Neto | Net book value (NBV) |
| פחת נצבר | Pachat Nitzbar | Accumulated depreciation |
| ערך גרט (ערך שייר) | Erech Gared / Shayer | Salvage / residual value |
| מימוש / גריעה | Mimush / Grieʼa | Disposal / retirement |
| רווח הון | Revach Hon | Capital gain |
| הפסד הון | Hefsed Hon | Capital loss |
| שערוך | Shiʼeruch | Revaluation (IAS 16) |
| עודף שערוך | Odef Shiʼeruch | Revaluation surplus (equity) |
| פגיעה בערך | Pegiʼa ba-Erech | Impairment (IAS 36) |
| סכום בר-השבה | Schum Bar-Hashava | Recoverable amount |
| מבנה תעשייתי | Mivne Taʼasiyati | Industrial building |
| מכונות חיתוך / עיבוד שבבי | Mechonot Chituch / Ibbud Shvavi | Metal fabrication / CNC |
| ציוד כבד | Tziyud Kaved | Heavy equipment |
| רכב מסחרי / רכב פרטי | Rechev Mis'chari / Prati | Commercial / private vehicle |
| רכב צמוד | Rechev Tzamud | Company car (with deduction cap) |
| מתקן סולארי | Mitkan Solari | Solar installation |
| תשתית דיגיטלית | Tashtit Digitalit | Digital infrastructure |
| דו"ח השקעות הון | Doach Hashkaʼot Hon | CAPEX report |
| פקודת יומן | Pkudat Yoman | Journal entry |
| העברת נכס | Haʼavarat Nechess | Asset transfer |

---

## 10. Test Results

**Runner:** `node --test test/finance/fixed-assets.test.js`
**Status:** **31 / 31 PASS** — 0 failed, 0 skipped.
**Duration:** ~126 ms on a dev workstation.

### Test coverage matrix

| Group | Tests | Focus |
| --- | --- | --- |
| § 1 Rate lookup | 4 | All required classes present; rate values match 1991 regs; Hebrew aliases; default fallback |
| § 2 Depreciation math | 3 | SL / DDB / SOYD pure helpers |
| § 3 `acquireAsset` | 2 | Happy path; validation |
| § 4 `computeDepreciation` | 5 | SL full year; SL monthly; DDB > SL year 1; SOYD year-1 > year-2; salvage floor |
| § 5 Full-life schedule | 3 | SL sums to cost − salvage; chronological order; DDB termination |
| § 6 Disposal + Y-006 bridge | 4 | Gain; loss; balanced journal; double-dispose guard |
| § 7 Revaluation | 2 | Uplift → equity surplus; downward revaluation |
| § 8 Impairment | 3 | Indicators only; write-down; no-write-down |
| § 9 Transfer | 2 | Relocation appends history; refuses on disposed |
| § 10 CAPEX report | 1 | Year + category aggregation |
| § 11 Append-only | 1 | Full audit trail after acq → transfer → depreciate → impair → dispose |
| § 12 `classifyByDepreciationClass` | 1 | Public rate info lookup |

### Key assertion highlights

- `DEPRECIATION_CLASSES.COMPUTERS.rate === 0.33`
- `DEPRECIATION_CLASSES.BUILDING_NON_INDUSTRIAL.rate === 0.04`
- `DEPRECIATION_CLASSES.MACHINERY_METAL_FAB.rateMax >= 0.20`
- `DEPRECIATION_CLASSES.VEHICLE_PRIVATE.restrictedDeduction === true`
- SL schedule sum = `cost − salvage` within ±0.05 ILS
- DDB year-1 expense > SL year-1 expense
- Disposal journal: Σ debits ≈ Σ credits (balanced)
- `history()` after full lifecycle contains ACQUIRE + TRANSFER + DEPRECIATE + IMPAIR + DISPOSE

---

## 11. Integration Points

| Consumer | Hook | Notes |
| --- | --- | --- |
| **Y-006 Capital Gains** (`src/tax/capital-gains.js`) | `new FixedAssetRegister({onCapitalGainsEvent: cb})` | Disposal emits event; cb forwards to `computeGain()` for CPI/linear split |
| **GL — Journal Entry** (`src/gl/journal-entry.js`) | Disposal `journal` payload | Lines map onto COA codes (ACCUM_DEPR, FA, CASH/BANK, GAIN/LOSS) — balanced |
| **VAT** (`src/vat/*`) | `vat` field on `acquireAsset()` | Tracked but not capitalized (recoverable input VAT) |
| **Financial Statements** (`src/gl/financial-statements.js`) | `capexReport()` → Cash-flow investing section | Totals feed Board pack |
| **CAPEX budgeting** (`src/budget/*`) | `capexReport({year})` | Actual-vs-budget variance |

---

## 12. Design Notes

1. **Never deletes.** `disposeAsset` flips `status` and retains the full
   record. Transfer history is a list. Impairment adds to `impairmentLoss`
   without overwriting prior entries. Append-only by construction.
2. **Deterministic.** Given identical inputs, identical outputs — no
   `Math.random`, no current-time fallbacks inside math paths (except the
   injected `now()` for timestamps, which is itself injectable for tests).
3. **Bilingual errors.** Every `throw new Error(...)` carries `... | ...`
   with the English message before the pipe and the Hebrew translation
   after. Every returned result object with a user-facing label has
   `{en, he}`.
4. **Banker-safe rounding.** `round2()` applies `Math.round((n + ε) * 100)`
   to avoid the classic `0.1 + 0.2` drift and stays at 2 decimals (agorot).
5. **Tax vs. book separation.** Revaluation and DDB are book concepts
   (IAS 16, management election); the Israeli tax deduction column always
   uses the SL rate from the embedded table. The Y-006 bridge always ships
   the original acquisition cost, NOT the revalued basis.
6. **Pure Node, zero deps.** `require('node:test')` + `require('node:assert/strict')`
   only — matches the conventions used by other onyx-procurement unit suites.

---

## 13. Files Touched (new, none modified/deleted)

| File | Purpose |
| --- | --- |
| `onyx-procurement/src/finance/fixed-assets.js` | Module (~650 LoC) — class `FixedAssetRegister` + embedded table |
| `onyx-procurement/test/finance/fixed-assets.test.js` | Test suite (31 tests) |
| `_qa-reports/AG-Y076-fixed-assets.md` | This report |

**Never delete.** This report is the canonical reference for the fixed
asset module and must be kept alongside the module for auditability.

---

## 14. Open Follow-ups (for next wave)

1. Add a periodic `runDepreciation(period)` helper that posts depreciation
   for **every** active asset in one call and returns a bulk journal.
2. Link `capexReport` to the Budget agent for real-time CAPEX variance.
3. Wire the `onCapitalGainsEvent` callback in the app bootstrap to
   `src/tax/capital-gains.js → computeGain()` for end-to-end disposal →
   tax calculation in a single flow.
4. Extend the table with niche classes when needed (livestock, mineral
   rights, intangible goodwill) — each addition must cite its
   לוח / סעיף source.
5. IFRS 16 right-of-use assets (leases) — separate module (future agent).

---

*End of AG-Y076 report — Techno-Kol Uzi Mega-ERP 2026 / Kobi EL / Swarm 4B*
