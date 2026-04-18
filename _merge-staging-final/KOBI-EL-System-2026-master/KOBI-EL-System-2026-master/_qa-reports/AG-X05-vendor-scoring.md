# AG-X05 — Vendor Performance Scoring

**Agent:** X-05 (Swarm 3)
**Date:** 2026-04-11
**Project:** onyx-procurement (Kobi's mega-ERP for Techno-Kol Uzi)
**Rule of engagement:** nothing is deleted. This report is additive.
**Dependencies:** zero third-party (node built-ins only).

---

## 0. Executive summary

New analytics module that rates the supplier base on a single
0-100 composite plus four discrete badges (`ספק מועדף`, `ספק מאושר`,
`ניטור`, `הסרה`), surfaces risks (single-source, concentration,
declining trend, late streak, quality red-line, payment weakness),
and emits Hebrew-first bilingual recommendations per vendor.

| Item                                   | Status          |
|----------------------------------------|-----------------|
| Core module created                    | done            |
| Public API surface                     | 4 functions     |
| Extras (steel benchmark)               | done            |
| Test suite (`node:test`)               | 32 cases, green |
| Hebrew RTL / bilingual output          | done            |
| Israeli metal-fab specifics            | done            |
| Zero third-party dependencies          | confirmed       |
| Files touched destructively            | none            |

---

## 1. Artefacts

| File                                                               | LOC  | Purpose                        |
|--------------------------------------------------------------------|-----:|--------------------------------|
| `onyx-procurement/src/analytics/vendor-scoring.js`                 |  ~690 | main module                    |
| `onyx-procurement/test/payroll/vendor-scoring.test.js`             |  ~360 | 32 test cases                  |
| `_qa-reports/AG-X05-vendor-scoring.md`                             |    — | this report                    |

New directory `src/analytics/` was created (previously empty /
non-existent). No existing files were altered.

---

## 2. Scoring model

### 2.1 Weights (locked, sum = 1.00)

| Dimension                   | Weight |
|-----------------------------|-------:|
| On-time delivery            |   40 % |
| Price competitiveness       |   20 % |
| Quality (reject / RMA)      |   20 % |
| Communication responsiveness|   10 % |
| Payment terms               |   10 % |

### 2.2 Dimension rubrics

**On-time delivery.** Each PO is checked against its `promisedAt`.
Urgent POs use a 24-hour tolerance window; standard POs use a 7-day
window. Delivered on or before promise → 1.0. Delivered inside the
tolerance window → 0.5. Beyond → 0.0. A longest-streak of late
deliveries is kept for risk detection.

**Price competitiveness.** Computes `(vendorPrice − marketMedian)
/ marketMedian`. Curve:

| delta window | score |
|---|---|
| ≤ −10 % | 100 |
| −10 % → 0 | linear 100 → 80 |
| 0 → +5 % | linear 80 → 60 |
| +5 % → +20 % | linear 60 → 20 |
| > +20 % | 10 |

If no external median is supplied, the module falls back to the
internal price median across the vendor's own POs (neutral 50 if
even that is impossible).

**Quality.** Base from reject rate:

| reject rate | base |
|---|---|
| ≤ 0.1 % | 100 |
| 0.1 % → 1 % | 100 → 90 |
| 1 % → 3 % | 90 → 70 |
| 3 % → 5 % | 70 → 50 |
| 5 % → 10 % | 50 → 20 |
| > 10 % | 10 |

RMA rate applies an additional penalty of up to 20 points.

**Communication.** Average first-response hours (either from
`commHours` on POs or an explicit `communications[]` array):

| avg hours | score |
|---|---|
| ≤ 4 h | 100 |
| 4 → 12 h | 100 → 85 |
| 12 → 24 h | 85 → 65 |
| 24 → 72 h | 65 → 25 |
| > 72 h | 15 |

**Payment terms.** Longer net is better for Techno-Kol as the buyer:

| avg days | score |
|---|---|
| ≥ 90 | 100 |
| 60 → 90 | 80 → 100 |
| 30 → 60 | 60 → 80 |
| 7 → 30 | 30 → 60 |
| < 7 | 15 |

### 2.3 Badge map

| composite | badge (HE) | badge (EN) |
|---|---|---|
| > 85 | ספק מועדף | Preferred |
| 70 – 85 | ספק מאושר | Approved |
| 50 – 70 | ניטור | Monitor |
| < 50 | הסרה | Remove |

---

## 3. Risk detection

| code | trigger | severity |
|---|---|---|
| `SINGLE_SOURCE` | > 60 % of a category from one vendor | high |
| `CONCENTRATION` | > 30 % of total spend | medium |
| `DECLINING_TREND` | ≥ 5 pt drop over the last 5 recorded scores | medium |
| `LATE_STREAK` | ≥ 3 consecutive late POs | high |
| `QUALITY_RED` | reject rate > 5 % | high |
| `PAYMENT_TERMS_WEAK` | avg terms < 15 days | low |
| `NO_HISTORY` | zero POs on file | low |

Each risk is emitted with a Hebrew label, severity, and a
short Hebrew `detail` string. Risks are purely additive — they
never mutate the composite.

---

## 4. Israeli metal-fab specifics

1. **Delivery windows.** 24 h for urgent POs, 7 d for standard,
   exactly as specified in the brief.
2. **Steel price index benchmark.** `benchmarkSteelPrices(pos,
   monthlyIndex)` compares each PO to a monthly `{'YYYY-MM': price}`
   index (LME-aligned). Returns per-month delta and an average
   delta across the window. This can be plugged into a monthly
   cron — the agent deliberately avoided reaching out to the
   network so there is no "live LME fetch" inside the module.
3. **Cooperative discounts (קיבוץ / רמת גולן).** A ±3 %
   tolerance window around market median is zeroed out when the
   PO (or vendor name) matches a cooperative. A tiny +2 pt uplift
   is then applied to the price sub-score. This reflects the
   reality that cooperatives price to cost and rarely undercut
   the median, yet are strategic relationships Techno-Kol values.
   Detection is regex-based on
   `קיבוץ|רמת[\s-]?גולן|kibbutz|ramat[\s-]?golan`.
4. **Commodity keys.** Steel, aluminium, copper are the primary
   categories the procurement team tracks (consistent with the
   existing `inventory-valuation.js` `COMMODITY_ALIASES`).

---

## 5. Public API

```js
const {
  scoreVendor,
  compareVendors,
  detectSingleSource,
  vendorScorecard,
  benchmarkSteelPrices,
} = require('./src/analytics/vendor-scoring.js');
```

### 5.1 `scoreVendor(vendorId, history)`

`history` may be:

- an **array** of PO objects, **or**
- an **object** `{ purchaseOrders, communications, payments,
  recentScores, shareOfSpend, singleSourceCategories }`.

Returns:

```js
{
  vendorId, composite, badge, badgeEn,
  dimensions: {
    onTimeDelivery:        { score, onTimeRate, samples, maxLateStreak, detail },
    priceCompetitiveness:  { score, delta, samples, detail },
    quality:               { score, rejectRate, rmaRate, samples, detail },
    communication:         { score, avgHours, samples, detail },
    paymentTerms:          { score, avgDays, samples, detail },
  },
  weights, risks, recommendations, samples, asOf,
}
```

### 5.2 `compareVendors(records)`

Ranked table (high → low) with dimensional breakdown, badge, and
a compact list of risk codes.

### 5.3 `detectSingleSource(catalog, category?)`

Scans a catalog of POs (array or `{purchaseOrders}`) and emits a
warning whenever one vendor exceeds 60 % of a category's spend.
Severities: medium (60-70 %), high (70-80 %), critical (> 80 %).

### 5.4 `vendorScorecard(vendorId, history)`

Returns a plain-text Hebrew-first bilingual report (RTL-safe).
Includes a 0-20 cell bar chart per dimension, risks section, and
numbered recommendations section. Dual-purpose: CLI output and
email/PDF drop-in.

### 5.5 `benchmarkSteelPrices(pos, monthlyIndex)`

Monthly steel-index benchmarking (see §4).

---

## 6. Recommendations engine

Recommendations are emitted in Hebrew and de-duplicated. Rules:

- `> 85` → "להגדיל הקצאת תקציב ... הסכם מסגרת שנתי"
- `70 – 85` → "להמשיך עבודה שוטפת תוך מעקב רבעוני"
- `50 – 70` → "לפתוח תהליך איתור ספק חלופי במקביל"
- `< 50` → "להוציא מרשימת הספקים ... תוך 30 יום"
- Dimension-specific fallbacks are added when a sub-score is red
  (on-time, price, quality, comm, payment).
- Each active risk code maps to a targeted remediation (e.g.
  `SINGLE_SOURCE` → "לאתר ספק שני באותה קטגוריה").

---

## 7. Test report

Invocation:

```bash
cd onyx-procurement
node --test test/payroll/vendor-scoring.test.js
```

Result (as of 2026-04-11):

```
ℹ tests 32
ℹ pass 32
ℹ fail 0
ℹ duration_ms ~154
```

### 7.1 Test matrix (32 cases)

| #  | Case                                                                         | Pass |
|---:|------------------------------------------------------------------------------|:----:|
|  1 | weights sum to exactly 1.0                                                    |  Y   |
|  2 | `badgeFor` threshold boundaries (100 / 85 / 70 / 50 / 0)                      |  Y   |
|  3 | `scoreVendor` — preferred vendor gets Preferred badge                         |  Y   |
|  4 | `scoreVendor` — bad vendor gets Remove badge + all dims red                   |  Y   |
|  5 | `scoreOnTimeDelivery` — urgent 24 h window                                    |  Y   |
|  6 | `scorePriceCompetitiveness` — 10 % below median is perfect                    |  Y   |
|  7 | `scorePriceCompetitiveness` — 20 % above median is low                        |  Y   |
|  8 | `priceDeltaToScore` — cooperative uplift                                      |  Y   |
|  9 | `scoreQuality` — zero defects = 100                                           |  Y   |
| 10 | `scoreQuality` — 10 % rejects + RMA very low                                  |  Y   |
| 11 | `scoreCommunication` — 2 h avg = perfect                                      |  Y   |
| 12 | `scoreCommunication` — uses `communications[]` array                          |  Y   |
| 13 | `scorePaymentTerms` — net 90 / net 7 / net 3                                  |  Y   |
| 14 | `detectSingleSource` — > 60 % triggers warning                                |  Y   |
| 15 | `detectSingleSource` — filter by category                                     |  Y   |
| 16 | `compareVendors` — ranks high → low                                           |  Y   |
| 17 | `detectRisks` — late streak ≥ 3 flagged                                       |  Y   |
| 18 | `detectRisks` — quality red line > 5 %                                        |  Y   |
| 19 | `detectRisks` — concentration > 30 %                                          |  Y   |
| 20 | `detectRisks` — declining trend                                               |  Y   |
| 21 | `detectRisks` — empty history → no-history risk                               |  Y   |
| 22 | `detectRisks` — single-source category flagged via `extra`                    |  Y   |
| 23 | recommendations — preferred vendor gets expand advice                         |  Y   |
| 24 | recommendations — bad vendor gets remove advice                               |  Y   |
| 25 | `vendorScorecard` — HE + EN labels in report                                  |  Y   |
| 26 | `vendorScorecard` — bad vendor includes risks section                         |  Y   |
| 27 | `benchmarkSteelPrices` — monthly LME index alignment                          |  Y   |
| 28 | `normaliseHistory` — accepts array OR object shape                            |  Y   |
| 29 | cooperative `קיבוץ` detection via vendor name                                 |  Y   |
| 30 | composite math matches manual weighted sum                                    |  Y   |
| 31 | `scoreVendor` never mutates the input history array                           |  Y   |
| 32 | `detectSingleSource` — 80 %+ share is critical severity                       |  Y   |

---

## 8. Non-deletion audit

- The `src/analytics/` directory did not exist. It was created.
- No existing file was opened for write.
- No existing exports were altered or removed.
- No third-party packages were added; `package.json` untouched.
- Test runner is node's built-in `node:test` (already in use by
  `inventory-valuation.test.js` and other modules).

---

## 9. Known limitations / future work

1. The module is pure. It does **not** pull PO data from Supabase
   itself — the caller is expected to assemble `history`. This is
   by design and matches `inventory-valuation.js`, but a thin
   `loadFromSupabase` could be added later if the procurement UI
   wants a single-line call.
2. The LME steel index is expected to be provided externally
   (monthly cron into a JSON file or key-value store). No live
   HTTP fetch inside the scoring module.
3. Risks `CONCENTRATION`, `DECLINING_TREND`, and
   `SINGLE_SOURCE` rely on contextual inputs (`shareOfSpend`,
   `recentScores`, `singleSourceCategories`) provided through
   the structured-history object. `detectSingleSource` itself is
   a standalone helper for the category-wide scan.
4. Hebrew strings are plain text — no ICU/MessageFormat. The
   downstream renderer is responsible for RTL bidi handling.

---

*End of AG-X05 report.*
