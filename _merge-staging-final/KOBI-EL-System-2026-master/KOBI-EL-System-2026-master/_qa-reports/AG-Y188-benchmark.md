# AG-Y188 — Benchmark Comparator / משווה ביצועים תעשייתי

**Agent:** Y-188
**Scope / תחום:** KPI benchmarking vs. Israeli industry — metal fabrication + real estate
**Date / תאריך:** 2026-04-11
**Status / סטטוס:** GREEN — 22/22 passing
**Build:** Techno-Kol Uzi mega-ERP

---

## 1. Mission / משימה

**EN:** Build a reusable benchmark comparator that rates company KPIs
against Israeli SMB industry curves for metal fabrication and real
estate holdings, producing percentile rankings, a bilingual report,
and an injectable benchmark table for tests and regulator updates.

**HE:** בניית משווה ביצועים חוזר-שימוש המדרג את מדדי החברה מול עקומות
התעשייה הישראלית לעסקים קטנים-בינוניים בתחומי ייצור מתכת ונדל"ן.
המודול מפיק אחוזון, דו"ח דו-לשוני, וטבלת benchmarks הניתנת להזרקה
לצורך בדיקות ועדכוני רגולציה.

---

## 2. Files delivered / קבצים שנוצרו

| # | File | Lines | Role |
|---|------|------:|------|
| 1 | `onyx-procurement/src/reporting/benchmark.js` | 568 | Core module — class `BenchmarkComparator` + frozen defaults |
| 2 | `onyx-procurement/test/reporting/benchmark.test.js` | 300+ | 22 unit tests using `node:test` + `node:assert/strict` |
| 3 | `_qa-reports/AG-Y188-benchmark.md` | (this file) | Bilingual QA report |

No file was deleted; no file outside the three listed was touched.

---

## 3. Public API surface / ממשק ציבורי

```js
const { BenchmarkComparator } = require('./src/reporting/benchmark');

const cmp = new BenchmarkComparator();         // optional: { benchmarks, notes, locale }
cmp.loadBenchmarks('metal_fab', 'small');      // returns snapshot {industry, size, metrics, loadedAt}
cmp.percentile('grossMargin', 32);             // -> 0..100
cmp.rateMetric('dso', 55);                     // -> {percentile, status, labelHe, labelEn, ...}
cmp.compare(myMetrics);                        // -> full bilingual report object
cmp.industryNotes('real_estate');              // -> [{he, en}, ...]
cmp.bilingualReport(cmpResult);                // -> plain-text Hebrew+English report
```

Constants also exported: `DEFAULT_BENCHMARKS`, `DEFAULT_NOTES`,
`METRIC_META`, status codes, direction codes, industry + size keys,
and an `_internals` object for white-box tests.

---

## 4. Covered metrics / מדדים מכוסים

| Key | HE | EN | Direction | Industries |
|-----|----|----|-----------|------------|
| grossMargin | שולי רווח גולמי | Gross margin | higher-better | metal_fab |
| operatingMargin | שולי רווח תפעולי | Operating margin | higher-better | metal_fab + real_estate |
| netMargin | שולי רווח נקי | Net margin | higher-better | metal_fab + real_estate |
| ebitdaMargin | שולי EBITDA | EBITDA margin | higher-better | metal_fab |
| revenuePerEmployee | הכנסה לעובד | Revenue per employee | higher-better | both |
| profitPerEmployee | רווח לעובד | Profit per employee | higher-better | both |
| dso | ימי גבייה (DSO) | Days sales outstanding | lower-better | both |
| dpo | ימי תשלום (DPO) | Days payable outstanding | higher-better | both |
| inventoryTurnover | מחזורי מלאי | Inventory turnover | higher-better | metal_fab |
| capRateResidential | Cap rate — מגורים | Residential cap rate | higher-better (in band) | real_estate |
| capRateCommercial | Cap rate — מסחרי | Commercial cap rate | higher-better (in band) | real_estate |
| occupancyRate | אחוז תפוסה | Occupancy rate | higher-better | real_estate |
| noiMargin | שולי NOI | NOI margin | higher-better | real_estate |

---

## 5. Benchmark bands used / טווחי ייחוס שהוזנו

### Metal fab, small tier (10-49 employees / ייצור מתכת, קטן)

| Metric | p10 | p25 | p50 | p75 | p90 |
|--------|----:|----:|----:|----:|----:|
| Gross margin | 20 | 25 | **30** | 34 | 40 |
| Operating margin | 4 | 8 | **11.5** | 14 | 18 |
| Net margin | 2 | 4 | 7 | 10 | 13 |
| DSO (days) | 90 | 75 | 62 | 48 | 35 |
| Inventory turnover | 2.5 | 3.5 | 5.0 | 7.0 | 10.0 |
| Revenue/employee (ILS) | 350k | 500k | 680k | 850k | 1.05M |

Gross 25-35% and operating 8-15% bands cover the interquartile range
(p25..p75), matching the prompt.

### Real estate, small tier (נדל"ן, קטן)

| Metric | p10 | p25 | p50 | p75 | p90 |
|--------|----:|----:|----:|----:|----:|
| Cap rate residential (%) | 4.0 | 5.0 | **6.3** | 7.5 | 8.5 |
| Cap rate commercial (%) | 5.0 | 6.0 | **7.3** | 8.5 | 9.8 |
| Occupancy (%) | 78 | 85 | 90 | 94 | 97 |
| NOI margin (%) | 48 | 55 | 62 | 70 | 77 |
| DSO (days) | 38 | 25 | 15 | 8 | 4 |

Residential 5-8% and commercial 6-9% bands cover the interquartile range.

All four size tiers (`micro`, `small`, `medium`, `large`) are populated
for both industries.

---

## 6. Test summary / סיכום בדיקות

```
node --test onyx-procurement/test/reporting/benchmark.test.js
tests 22
suites 0
pass 22
fail 0
cancelled 0
skipped 0
todo 0
```

### Coverage map / מפת כיסוי

| ID | Test | Purpose |
|----|------|---------|
| Y-188/01 | loadBenchmarks happy path | Snapshot shape + timestamp |
| Y-188/02 | loadBenchmarks bad industry | Error path |
| Y-188/03 | loadBenchmarks bad size | Error path |
| Y-188/04 | metal fab gross 25-35% | Band validation |
| Y-188/05 | metal fab op 8-15% | Band validation |
| Y-188/06 | real estate residential 5-8% | Band validation |
| Y-188/07 | real estate commercial 6-9% | Band validation |
| Y-188/08 | percentile — higher-is-better | Monotonic grossMargin |
| Y-188/09 | percentile — lower-is-better (DSO) | Inversion correct |
| Y-188/10 | rateMetric bilingual labels | HE + EN + status |
| Y-188/11 | compare() structured report | strengths + weaknesses |
| Y-188/12 | industryNotes bilingual | every note has he+en |
| Y-188/13 | bilingualReport contents | HE chars + EN chars |
| Y-188/14 | injectable benchmarks | override default table |
| Y-188/15 | percentile null guards | NaN / unknown key |
| Y-188/16 | compare before load throws | state guard |
| Y-188/17 | Hebrew industry aliases | נדל"ן / מתכת resolve |
| Y-188/18 | real estate compare E2E | 5 metrics graded |
| Y-188/19 | no mutation of injected table | immutability |
| Y-188/20 | deterministic metric order | stable output |
| Y-188/21 | METRIC_META completeness | all keys have he/en/unit/dir |
| Y-188/22 | percentileToStatus tiers | EXCELLENT..POOR + UNKNOWN |

Total: 22 tests (prompt asked for 15+).

---

## 7. Bilingual / Hebrew-safety notes / הערות נגישות

- Every status code has an explicit Hebrew string: `מצוין`, `מעל הממוצע`,
  `ממוצע`, `מתחת לממוצע`, `חלש`, `לא ידוע`.
- Every metric label is both HE and EN, stored in a frozen
  `METRIC_META` map (test Y-188/21 verifies completeness).
- `bilingualReport()` output is plain UTF-8 text that mixes HE and
  EN per line; test Y-188/13 asserts both scripts are present.
- Hebrew currency uses `toLocaleString('he-IL')` with `₪` prefix.
- Hebrew industry aliases (`נדל"ן`, `מתכת`, `ייצור מתכת`) normalise
  to the canonical machine keys via `normaliseIndustry()`.

---

## 8. Compliance with task rules / עמידה בכללים

| Rule | Status |
|------|--------|
| Never delete | PASS — module is additive only; no file removed |
| Node built-ins only | PASS — uses `node:test`, `node:assert/strict`, no deps |
| Bilingual | PASS — HE + EN in code, tests, and this report |
| Class `BenchmarkComparator` with `loadBenchmarks` + `compare` | PASS |
| Percentile ranking per metric | PASS — piecewise-linear, both directions |
| Metal fab 25-35% gross / 8-15% op | PASS — p25..p75 cover the bands |
| Real estate 5-8% res / 6-9% commercial | PASS — p25..p75 cover the bands |
| Employee productivity | PASS — revenuePerEmployee + profitPerEmployee |
| DSO / DPO | PASS — directional scoring |
| Benchmarks injectable for testing | PASS — ctor `{ benchmarks }` hook, test Y-188/14 |
| 15+ tests | PASS — 22 tests |
| Bilingual report | PASS — this file + `bilingualReport()` method |

---

## 9. Known limitations / מגבלות ידועות

1. Percentile curves use five anchors (p10/p25/p50/p75/p90).
   Sub-percentile smoothing relies on linear interpolation; a Kaplan-
   Meier fit would be marginally more accurate but adds complexity.
2. Cap rate is modelled as "higher-better" without an upper ceiling;
   extremely high cap rates in real estate can indicate risk rather
   than strength. Future work: add banded direction (`in_band_best`).
3. Benchmarks are a 2026 snapshot. The module is designed for
   quarterly refresh via the injectable benchmark table — no code
   edit required.

---

## 10. Verdict / פסק

**EN:** GO — ready to wire into the reporting dashboard. Zero third-
party dependencies, deterministic output, bilingual from day one,
and 22/22 tests passing.

**HE:** אישור להטמעה — המודול מוכן לחיבור לדשבורד הדיווח. ללא תלויות
חיצוניות, פלט דטרמיניסטי, דו-לשוני מלא, ו-22 מתוך 22 בדיקות עוברות.

---

**Signed / חתום:** Agent Y-188 · Techno-Kol Uzi mega-ERP · 2026-04-11
