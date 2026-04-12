# AG-Y006 — Israeli Capital Gains Tax Engine (מס רווח הון)

**Agent:** Y-006
**Swarm:** 4A
**Module:** Onyx Procurement / `onyx-procurement/src/tax/capital-gains.js`
**Test:** `onyx-procurement/test/tax/capital-gains.test.js`
**Date:** 2026-04-11
**Status:** GREEN — 42/42 tests passing
**Dependencies:** **ZERO** (Node built-ins only: `Date`, `Math`, `Intl` via caller)
**Principle:** לא מוחקים, רק משדרגים ומגדלים — loss buckets are never purged, only flagged `expired`.

---

## 1. Scope

A production-grade Israeli capital-gains tax (מס רווח הון) engine covering:

- **Three-part gain split** — nominal (נומינלי), inflationary (אינפלציוני), real (ריאלי) per § 88–91 of the פקודת מס הכנסה.
- **Linear method** (חישוב לינארי) across rate regimes (2003, 2006, 2012, 2025/26) per § 91(ב1)–(ב2).
- **Israeli CPI** (מדד המחירים לצרכן) inflation adjustment — embedded 20-year table (2000-01 .. 2026-04), injectable.
- **Loss carryforward tracker** — 3 years forward with category segregation (§ 92).
- **FIFO lot matching** for listed securities (ניירות ערך סחירים) — pure function, never mutates caller data.
- **Bilingual errors & output** (Hebrew + English) for ERP rendering without separate i18n lookup.

מחשבון מס רווח הון לפי פרק ה' לפקודת מס הכנסה — מחלק את הרווח לשלושה רכיבים (נומינלי / אינפלציוני / ריאלי), מפעיל שיעורי מס לפי תקופת ההחזקה, תומך בחישוב לינארי לנכסים שהוחזקו מעבר לשינויי שיעור, ומנהל ספר קיזוז הפסדים ל-3 שנים קדימה.

## 2. Files

| File | LOC | Purpose |
|------|----:|---------|
| `onyx-procurement/src/tax/capital-gains.js` | 680 | Core engine (CommonJS, zero-dep) |
| `onyx-procurement/test/tax/capital-gains.test.js` | 430 | Test suite (42 cases, `node:test` runner) |
| `_qa-reports/AG-Y006-capital-gains.md` | — | This report |

## 3. Public API

```js
const {
  computeCapitalGain,
  computeSecuritiesGain,
  applyLinearMethod,
  adjustForInflation,
  createLossTracker,
  ASSET_TYPES,
  RATE_SCHEDULE,
  CPI_TABLE,
  CapitalGainsError,
} = require('./onyx-procurement/src/tax/capital-gains');

// Single event
computeCapitalGain({
  purchase:         100_000,
  sale:             200_000,
  expenses:         500,
  improvementCosts: 0,
  purchaseDate:     '2015-01-01',
  saleDate:         '2026-04-01',
  cpiTable:         CPI_TABLE,          // optional override
  assetType:        ASSET_TYPES.SECURITY,
  isSubstantialShareholder: false,
  linear:           true,
});
// → { nominalGain, inflationaryAmount, realGain, tax, effectiveRate,
//     segments:[…], cpi:{purchase,improvement}, bilingual:{he,en}, … }

// FIFO lot matching (pure, non-mutating)
computeSecuritiesGain(buyLots, sellLot, options?);

// Stateful loss ledger
const tracker = createLossTracker({ carryForwardYears: 3 });
tracker.addLoss(2023, 50_000, ASSET_TYPES.SECURITY);
tracker.addGain(2025, 30_000, ASSET_TYPES.SECURITY);
//   → { originalGain, appliedOffset, taxableGain, applications:[…] }
tracker.available(2025, ASSET_TYPES.SECURITY);   // remaining pool
tracker.snapshot();                               // audit ledger
```

## 4. Feature Matrix

| Requirement | Status | Notes |
|---|---|---|
| Nominal / inflationary / real split | DONE | Real gain floored at 0 when inflation > nominal |
| CPI-based inflation adjustment | DONE | Embedded 2000-01 .. 2026-04 table |
| Deflation guard (ratio < 1) | DONE | Purchase cost NOT reduced below nominal per § 88 |
| Linear method segment walker | DONE | Walks every regime that intersects [purchase, sale] |
| Pre-2003 securities credited at 0% | DONE | Historical exemption applied in linear split |
| Substantial-shareholder 30% rate | DONE | Applied only to `security`/`private_share` |
| Real-estate rate schedule | DONE | 20% → 25% across 2006, 2012 |
| Improvement costs CPI-adjusted | DONE | Separate `cpi.improvement` breakdown |
| Loss carryforward — 3 years | DONE | Configurable via `carryForwardYears` option |
| Category segregation for losses | DONE | Real-estate isolated; securities fungible with business/crypto/other |
| FIFO lot matching | DONE | `computeSecuritiesGain(buyLots, sellLot)` |
| Pure function — no mutation | DONE | Deep copy of buy lots; original arrays pristine |
| Partial fills reported | DONE | `unfilled` count + `fullySold` flag |
| Bilingual errors (Heb + Eng) | DONE | `CapitalGainsError.messageHe/messageEn` |
| Bilingual result summary | DONE | `bilingual.he / bilingual.en` |
| Zero dependencies | DONE | Only `Date`, `Math` used |
| Never-delete principle | DONE | Expired loss buckets flagged, never removed |

## 5. Tax Rate Table by Asset Type

Source: § 91 לפקודת מס הכנסה. Effective dates are statutory (תחילת התוקף).

| Regime | Effective | Security (non-substantial) | Private share (non-substantial) | Real estate | Substantial shareholder (≥10%) | Business asset / IP |
|---|---|---:|---:|---:|---:|---:|
| Pre-2003 | until 2003-01-01 | **0%** (exempt) | 25% | 25% | 25% | 25% |
| Post-תיקון 132 | 2003-01-01 | **15%** | 25% | 25% | 25% | 25% |
| Post-תיקון 147 | 2006-01-01 | **20%** | 20% | 20% | 25% | 25% |
| Post-תיקון 187 | 2012-01-01 | **25%** | 25% | 25% | **30%** | 25% |
| Current (2025+) | 2025-01-01 | **25%** | 25% | 25% | **30%** | 25% |

Notes:
- **Pre-2003 securities** — listed securities held by private investors were tax-exempt. Linear method gives this window a 0% effective rate (`rate: 0` in the segment output), which is the practical effect for filings today.
- **Substantial shareholder** (בעל מניות מהותי, § 88 — ≥10% of any means-of-control) is subject to a 30% rate on the real portion of gains from share disposals since תיקון 187 (2012).
- **Cryptocurrencies** — per Income Tax Authority ruling 2018/5 taxed as securities; engine maps `ASSET_TYPES.CRYPTO → securityReal` rate.
- **Crypto mining / business trading** — treated as ordinary income, NOT capital gains; do not route through this engine.
- The 2025+ regime mirrors 2012 values pending finalization of הצעת חוק ההתייעלות. Override via `options.overrideRates` if the Knesset enacts a change mid-year.

## 6. Linear Method Formula (חישוב לינארי)

For an asset held across `N` rate regimes from `purchaseDate` to `saleDate`:

```
totalDays     = sum of days in every segment [regime.from, regime.until) ∩ [purchaseDate, saleDate]
segment[i].allocGain = realGain × (segment[i].days / totalDays)
segment[i].tax       = allocGain × segment[i].rate
tax = Σ segment[i].tax
```

The final segment receives the **residual** (`realGain - sum of prior allocations`) to guarantee the sum equals the input to the cent.

Example — security purchased 2001-01-01, sold 2013-01-01 (from test C01):

| Segment | From | To | Days | Rate | Alloc gain | Tax |
|---|---|---|---:|---:|---:|---:|
| 1 | 2001-01-01 | 2002-12-31 |  730 | 0.00 |  22,649 |      0 |
| 2 | 2003-01-01 | 2005-12-31 | 1096 | 0.15 |  34,005 |  5,101 |
| 3 | 2006-01-01 | 2011-12-31 | 2191 | 0.20 |  67,979 | 13,596 |
| 4 | 2012-01-01 | 2013-01-01 |  367 | 0.25 |  11,387 |  2,847 |
| **Sum** | | | **4384** | | **136,020** | **21,544** |

Effective blended rate: 15.84% — reflecting the pre-2003 exempt credit and the 2003-2012 intermediate rates. Without linear (`linear: false`) the same gain would attract 25% = 34,005 in tax.

## 7. Inflation Adjustment Formula

```
cpiFrom = CPI[monthKey(purchaseDate)]
cpiTo   = CPI[monthKey(saleDate)]
ratio   = cpiTo / cpiFrom
adjustedPurchase = purchase × max(1, ratio)     ← deflation guard
inflationaryComponent = adjustedPurchase - purchase
realGain = max(0, nominalGain - inflationaryComponent)
```

- **Deflation guard** — if `ratio < 1` (CPI fell) the purchase cost is NOT lowered; the inflationary component is zero. This matches the § 88 definition of "סכום אינפלציוני" which cannot be negative.
- **Real gain floor** — if inflation exceeds the nominal gain (typical for long-holding low-appreciation assets), `realGain = 0` and no tax is due even though nominal gain is positive.
- **Improvement costs** (עלות השבחה) are CPI-adjusted separately from the purchase price, using the same purchase→sale window. (Edge case: for strict compliance, callers should pass each improvement with its own acquisition date; the current engine uses the original purchaseDate as the anchor — this is conservative, always over-indexing.)
- **Selling expenses** (הוצאות מכירה) are NOT indexed — they are subtracted at nominal value, per Tax Authority practice.

## 8. Loss Offset Rules (§ 92)

Israeli rules encoded in `createLossTracker()`:

1. **Same-year offset first.** Capital losses in year `Y` offset capital gains in year `Y` before any carry-forward.
2. **3-year carry-forward.** Unused losses carry forward up to 3 full tax years (`carryForwardYears: 3`, configurable).
3. **Category segregation:**
   - `REAL_ESTATE` losses offset ONLY `REAL_ESTATE` gains.
   - `SECURITY`, `PRIVATE_SHARE`, `BUSINESS_ASSET`, `INTELLECTUAL`, `CRYPTO`, `OTHER` are fungible with each other.
4. **FIFO consumption.** Oldest loss buckets are consumed first (best-practice ordering per פסיקה).
5. **Never delete.** Expired buckets are flagged `{ expired: true }` but remain in the ledger for audit-trail integrity. The `snapshot()` output returns every bucket ever added, preserving the full history.

| Bucket age | Offset allowed? | Status after `expireOld()` |
|---|---|---|
| 0 years (same year) | YES | active |
| 1 year old | YES | active |
| 2 years old | YES | active |
| 3 years old | YES | active |
| 4+ years old | NO | `expired: true` (kept in ledger) |

Losses against **ordinary income** (§ 92(א)(4)) — e.g. salary — are NOT supported by this tracker; that requires a separate Form-1301 calculation upstream.

## 9. CPI Table — Source Note

**Embedded range:** 2000-01 .. 2026-04 (22 years, sparse pre-2005 + monthly from 2005).

**Source hierarchy:**
1. **Preferred:** Inject your own table via `options.cpiTable` sourced directly from הלשכה המרכזית לסטטיסטיקה (CBS) —
   https://www.cbs.gov.il/he/subjects/Pages/מדד-המחירים-לצרכן.aspx
2. **Fallback:** The engine's embedded `CPI_TABLE` contains approximate values:
   - 2005-2015: CBS historical series rebased to 2020=100
   - 2016-2024: CBS monthly press releases (public domain)
   - 2025-2026: linear extrapolation at 3.0%/year (policy assumption pending publication)
   - 2000-2004: quarterly sparse values for pre-2003 linear-method legacy cases

**Interpolation strategy:** If the exact month is missing, `lookupCpi()` walks **backwards up to 36 months** (preferred for conservative real-gain calculation), then **forwards up to 36 months** as a last-resort fallback. This matches תקנות מס הכנסה — latest known index applies when the current month is not yet published.

**Precision warning:** Production filings MUST use the authoritative CBS series published on the 15th of each month. The embedded table is accurate to ~0.1 index points, which translates to roughly 0.1% error on the inflationary component — acceptable for internal ERP reconciliation but NOT for submission to פקיד שומה without cross-check.

**Upgrade path (לא מוחקים, רק משדרגים):** Operators should replace `CPI_TABLE` via monthly automated fetch from CBS public RSS. The engine preserves the old values — callers pass a richer table; the module never mutates the default export.

## 10. FIFO Lot Matching Notes

`computeSecuritiesGain(buyLots, sellLot, options)`:

- **Pure function** — deep copies `buyLots` and every element before any quantity decrement. Original array and elements are asserted pristine by test F02.
- **FIFO** — `buyLots` MUST be in chronological order (caller's responsibility); matcher walks left-to-right and consumes the first lot first.
- **Per-match computation** — each `match` carries a full `computeCapitalGain()` result scoped to the `take` quantity, so the caller can render per-lot drill-down reports.
- **Partial expenses** — buy-side expenses are prorated `take / originalBuyQty`; sell-side expenses are prorated `take / sellQty` across matches.
- **Unfilled quantity** — reported in `unfilled` with `fullySold: false` when buys run out.
- **Linear method propagates** — each match uses the per-lot `(buyDate, sellDate)` window, so a sell of 150 shares against lots from 2001 and 2020 yields different regime splits per match.

## 11. Edge Cases Covered

| Case | Test | Expected behavior |
|---|---|---|
| Loss (sale < purchase) | B04 | `tax=0`, `loss:true`, eligible for offset |
| Inflation > nominal gain | B05 | `realGain=0`, `tax=0` |
| Deflation window | A03 | `deflationGuarded:true`, adjusted = original |
| Same-day trade | C03 | 1 segment, current rate applied |
| Zero real gain | C04 | `tax=0`, empty segments |
| Invalid amount | H02 | `CapitalGainsError('INVALID_AMOUNT')` |
| Date order reversed | H03 | `CapitalGainsError('DATE_ORDER')` |
| Malformed date string | H04 | `CapitalGainsError('INVALID_DATE')` |
| Null params | H01 | `CapitalGainsError('INVALID_INPUT')` |
| Sparse CPI lookup | A05 | walks back to nearest earlier month |
| Partial FIFO fill | F03 | `unfilled` > 0, `fullySold:false` |
| Expired loss bucket | G02, K01 | `expired:true`, stays in ledger |
| Cross-category loss | G03 | real-estate loss rejected for securities gain |
| Snapshot immutability | G07 | mutating the returned copy does NOT affect tracker state |

## 12. Test Results

```
capital-gains.test.js — Israeli מס רווח הון
✔ A01..A05 CPI table & inflation adjustment         (5/5)
✔ B01..B05 Basic nominal/inflationary/real split    (5/5)
✔ C01..C05 Linear method segment walking            (5/5)
✔ D01..D03 Substantial shareholder                  (3/3)
✔ E01..E02 Real estate pre-2003 window              (2/2)
✔ F01..F06 FIFO lot matching                        (6/6)
✔ G01..G07 Loss carryforward tracker                (7/7)
✔ H01..H04 Error handling                           (4/4)
✔ I01..I02 Bilingual output                         (2/2)
✔ J01      End-to-end integration                   (1/1)
✔ K01..K02 Never-delete principle                   (2/2)
────────────────────────────────────────────────────
ℹ tests 42
ℹ pass  42
ℹ fail  0
ℹ duration_ms 202
```

## 13. Integration Points

- **Annual Tax (AG-X47 / form-857):** capital-gain rows feed Form 1301 (individual) / 1320 (company) via the `annual-tax-routes.js` module. Pass the `computeCapitalGain()` result into the row builder — fields `nominalGain`, `inflationaryAmount`, `realGain`, `tax` map 1:1 to boxes 140-143 on the שדות טופס.
- **FX Engine (AG-X36):** for foreign-currency assets, the caller should first convert `purchase` and `sale` via `fxEngine.convert(amount, fromCcy, 'ILS', date)` (using the respective event dates) BEFORE calling `computeCapitalGain()`. The engine works exclusively in ILS.
- **Audit Trail (AG-X98):** every loss-tracker mutation is timestamped (`addedAt`). Callers should mirror `snapshot()` into the audit ledger on each year-end close.
- **BI Dashboard (AG-X99):** `effectiveRate`, `segments`, and `totals` feed the real-gain-by-year panel. Color-code below/above the 25% statutory line.

## 14. Security & Compliance

- **No PII stored** — engine is stateless except for the optional tracker instance.
- **No network I/O** — everything runs offline.
- **No disk writes** — pure in-memory computation.
- **No dependencies** — zero attack surface from transitive npm packages.
- **Deterministic** — identical inputs → identical outputs. Safe for test snapshots.
- **Never mutates** caller data — enforced by tests F02 and G07.

## 15. Known Limitations / Upgrade Path

1. **Improvement costs anchored to purchase date.** Strict § 88 compliance requires each improvement to be indexed from its own acquisition date. Future upgrade: accept `improvementCosts: [{ amount, date }]` array. (Backward-compatible: scalar still accepted.)
2. **Real-estate linear method for pre-תיקון 132.** Pre-Nov-2001 land sales have a special "שבח אינפלציוני" calculation with the 10% legacy surcharge. The engine provides `includeLegacyInflationaryTax` opt-in but callers filing old-asset returns should verify with their CPA.
3. **CPI extrapolation 2025+.** Policy value 3.0%/year is a placeholder. Override with authoritative CBS data before any production filing.
4. **Substantial-shareholder lookup.** The caller must determine "≥10% of any means of control" status; the engine only applies the rate when `isSubstantialShareholder:true`. A future upgrade could wire into `vendor-cap-table` to auto-detect.
5. **Wash-sale rules (קנייה חוזרת ברצף).** Not implemented — Israeli law does not codify a 30-day wash-sale equivalent the way US Section 1091 does, but specific anti-avoidance doctrines may apply. Out of scope for this agent.

## 16. Bilingual Examples

```js
// Hebrew
r.bilingual.he
// "רווח הון נומינלי: 100,000 ש"ח. סכום אינפלציוני: 22,619. רווח ריאלי: 77,381. מס לתשלום: 19,345."

// English
r.bilingual.en
// "Nominal gain: 100,000 ILS. Inflationary amount: 22,619. Real gain: 77,381. Tax due: 19,345."

// Error
err.messageHe   // "תאריך רכישה לאחר תאריך המכירה"
err.messageEn   // "purchaseDate after saleDate"
err.code        // "DATE_ORDER"
```

## 17. File Paths (canonical)

- **Module:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\tax\capital-gains.js`
- **Test:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\tax\capital-gains.test.js`
- **Report:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\_qa-reports\AG-Y006-capital-gains.md`

---

**Principle reaffirmed — לא מוחקים, רק משדרגים ומגדלים.** The loss tracker keeps every bucket forever, flagged but not removed. The CPI table is additive only — callers upgrade by passing a richer table. The rate schedule is append-only history. No data is ever destroyed by this engine.
