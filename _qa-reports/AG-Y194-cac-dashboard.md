# AG-Y194 — CAC Dashboard / לוח מחוונים לעלות רכישת לקוח

**Agent:** Y-194
**Date:** 2026-04-11
**Project:** onyx-procurement (Techno-Kol Uzi mega-ERP)
**Rules of engagement:** never delete; Node built-ins only; bilingual.
**Status:** Delivered — 27/27 tests green

---

## 0. Executive summary / תקציר מנהלים

**EN.** New pure-JavaScript analytics module `CACDashboard` that turns a
company's customer roster and marketing-spend ledger into a full Customer
Acquisition Cost dashboard. It computes blended / paid / organic CAC,
channel-level and segment-level CAC, a monthly trend, a line-item
attribution, and a payback-period (CAC / avg monthly gross profit per
customer). Zero third-party dependencies, class-based, fully bilingual
labels on every public return value. The module is additive — no existing
files were touched or deleted.

**HE.** מודול אנליטיקה חדש בג׳אווה-סקריפט טהור, `CACDashboard`, המחשב את
עלות רכישת הלקוח מתוך מאגר הלקוחות וספר הוצאות השיווק של החברה. הוא מספק
CAC משולבת, בתשלום ואורגנית, פילוח לפי ערוץ ולפי מגזר, מגמה חודשית,
ייחוס לפי סעיף שיווק, ותקופת החזר (CAC חלקי רווח גולמי ממוצע ללקוח לחודש).
בלי תלויות חיצוניות, מבוסס מחלקה, עם תוויות דו-לשוניות בכל תוצאה. המודול
הוא תוספי בלבד — שום קובץ קיים לא נמחק ולא שונה.

| Item / פריט                              | Status / מצב    |
|------------------------------------------|-----------------|
| Core module / מודול ליבה                 | done / הושלם    |
| Public API methods / שיטות API           | 9               |
| Test file / קובץ בדיקות                  | done / הושלם    |
| Test cases / מקרי בדיקה                  | 27 (≥ 15 required) |
| Tests green / בדיקות עוברות              | 27/27           |
| Bilingual output / פלט דו-לשוני          | he + en on every return object |
| Zero third-party deps / אפס תלויות       | confirmed / אושר |
| Files deleted / קבצים שנמחקו             | 0               |
| Files modified / קבצים ששונו             | 0 (pure additive) |

---

## 1. Files / קבצים

| File / קובץ                                                               | LOC  | Purpose / תפקיד                           |
|---------------------------------------------------------------------------|-----:|-------------------------------------------|
| `onyx-procurement/src/reporting/cac-dashboard.js`                         |  ~640 | Main class + helpers / מחלקה וכלי עזר    |
| `onyx-procurement/test/reporting/cac-dashboard.test.js`                   |  ~385 | 27 unit tests / 27 בדיקות יחידה          |
| `_qa-reports/AG-Y194-cac-dashboard.md`                                    |    — | This report / דוח זה                      |

New directories created: `onyx-procurement/src/reporting/` and
`onyx-procurement/test/reporting/`. Both were empty / non-existent.
No existing files were renamed, modified, or deleted.

---

## 2. Public API / ממשק ציבורי

```js
const { CACDashboard } = require('./src/reporting/cac-dashboard.js');

const dash = new CACDashboard({
  customers: [
    { id, acquiredAt, channel, segment, monthlyGrossProfit },
    // ...
  ],
  marketing: [
    { date, channel, segment, lineItem, amount, type: 'paid'|'organic' },
    // ...
  ],
  options: {
    currency: 'ILS',           // optional override
    paidChannels:   [...],     // optional — overrides default set
    organicChannels: [...],    // optional — overrides default set
    today: new Date(...),      // optional — makes resolvePeriod deterministic
  },
});

dash.blendedCAC(period);      // עלות רכישה משולבת
dash.paidCAC(period);         // עלות רכישה בתשלום
dash.organicCAC(period);      // עלות רכישה אורגנית
dash.byChannel(period);       // לפי ערוץ
dash.bySegment(period);       // לפי מגזר
dash.byLineItem(period);      // לפי סעיף שיווק
dash.trend(period);           // מגמה חודשית
dash.paybackPeriod(period);   // תקופת החזר (חודשים)
dash.summary(period);         // הכל-ב-קריאה-אחת
```

### Period shorthand / קיצורי תקופה

The `period` argument on every method accepts any of:

- `{ start: '2026-01-01', end: '2026-03-31' }` — explicit ISO range
- `{ year: 2026, quarter: 1 }`                  — calendar quarter
- `{ year: 2026, month: 4 }`                    — calendar month
- `{ year: 2026 }`                              — full year
- `{ ytd: true }`                               — year-to-date (anchored to `today`)
- `undefined`                                   — trailing 12 months

---

## 3. Formulas / נוסחאות

All formulas match the standard CFO / growth-marketer definitions used in
SaaS and multi-channel e-commerce:

| Metric / מדד              | Formula / נוסחה                                              |
|---------------------------|--------------------------------------------------------------|
| Blended CAC               | `totalSpend / customersAcquired`                             |
| Paid CAC                  | `paidSpend / paidCustomers`                                  |
| Organic CAC               | `organicSpend / organicCustomers`                            |
| Channel CAC               | `channelSpend / channelCustomers`                            |
| Segment CAC               | `(directSegmentSpend + pro-rata unallocated) / segCustomers` |
| Line-item CAC             | `lineItemSpend / (totalCustomers * lineItemSpendShare)`      |
| **Payback period (mos.)** | `CAC / avgMonthlyGrossProfitPerCustomer`                     |

**Classification rule.** A marketing row is paid if its `type` field says
so, otherwise if its `channel` is in the default paid set
(`google_ads`, `facebook_ads`, `linkedin_ads`, …). Anything else is
treated as organic — the conservative direction, because misclassifying
paid as organic inflates paid CAC, which is the less dangerous error
(over-stated efficiency is worse than understated).

**Unsegmented spend allocation.** Marketing rows without an explicit
`segment` are redistributed across segments using the customer-count
distribution for the period. This prevents an `unknown` segment row
from absorbing all the spend.

**Trend zero-fill.** Months with zero activity inside the requested
period are still returned (with `cac: null`) so the UI can render flat
gap-free timelines without date-hole stitching.

---

## 4. Bilinguality / דו-לשוניות

Every public return object carries a `label: { he, en }` bilingual
header. The `LABELS` dictionary is exported so the UI can render
headings, table captions, and `noData` / `noCustomers` statements in
Hebrew-first RTL without re-translation on the front end.

Examples:

```js
{ he: 'עלות רכישת לקוח משולבת', en: 'Blended CAC' }
{ he: 'תקופת החזר (חודשים)',    en: 'Payback Period (months)' }
{ he: 'לפי סעיף שיווק',          en: 'By Marketing Line Item' }
```

Error messages thrown from the constructor are bilingual too:

```
[CACDashboard] customers must be an array / customers חייב להיות מערך
```

Default line-item labels (`google_ads` → Google Ads / קמפיין גוגל אדס,
`salaries_marketing` → Marketing team salaries / שכר צוות שיווק, etc.)
are bundled with the module and merged automatically in `byLineItem()`.

---

## 5. Test suite / בדיקות

**Framework / מסגרת:** `node:test` + `node:assert/strict` (Node built-in).
**Command / פקודה:**
```bash
node --test test/reporting/cac-dashboard.test.js
```

**Result / תוצאה:** `27 passing, 0 failing, ~131 ms`.

```
ℹ tests 27
ℹ pass 27
ℹ fail 0
ℹ duration_ms 130.886
```

### Test coverage / כיסוי בדיקות

| #   | Test ID | Area / אזור                                                   |
|----:|---------|---------------------------------------------------------------|
|  1  | T01     | `r2` / `r4` rounding helpers                                  |
|  2  | T02     | `sum` skips non-numeric values                                |
|  3  | T03     | `safeDiv` null on zero denominator                            |
|  4  | T04     | `toISODate` handles Date, string, bad input                   |
|  5  | T05     | `monthsInPeriod` inclusive count                              |
|  6  | T06     | `monthKey` YYYY-MM                                            |
|  7  | T07     | `resolvePeriod` all shorthand forms                           |
|  8  | T08     | `classifyChannel` honors type + default sets                  |
|  9  | T09     | Constructor rejects non-array inputs (bilingual errors)       |
| 10  | T10     | Constructor accepts empty inputs / no customers               |
| 11  | T11     | `blendedCAC` — Q1 2026 totals                                 |
| 12  | T12     | `paidCAC` — paid spend / paid customers only                  |
| 13  | T13     | `organicCAC` — organic spend / organic customers only         |
| 14  | T14     | `byChannel` — grouping, classification, spend-descending sort |
| 15  | T15     | `bySegment` — proportional unsegmented-spend allocation       |
| 16  | T16     | `paybackPeriod` — blended + per-channel + per-segment months  |
| 17  | T17     | `trend` — monthly bucketing of spend & customers              |
| 18  | T18     | `trend` — zero-activity months included                       |
| 19  | T19     | `byLineItem` — customers attributed proportionally to spend   |
| 20  | T20     | `summary` — all sub-reports present and bilingual             |
| 21  | T21     | Zero-customer period → null CAC + bilingual "no customers"    |
| 22  | T22     | Zero-spend period → CAC = 0                                   |
| 23  | T23     | Out-of-period rows excluded from every metric                 |
| 24  | T24     | Unknown channel → `unknown` bucket, organic classification    |
| 25  | T25     | `paidChannels` option override reclassifies a channel         |
| 26  | T26     | Every top-level return carries `label.he` + `label.en`        |
| 27  | T27     | Currency defaults to `ILS` and is overridable                 |

Requirement was **≥ 15 tests** — delivered **27**.

### Fixture / מערך בדיקה

The fixtures model a realistic Q1 2026 book for a multi-channel Israeli
mega-ERP marketing department:

- 9 customers in-period (+ 2 deliberately out-of-period to prove the
  date filter works) across 3 segments (`smb`, `mid_market`,
  `enterprise`) and 7 channels (5 paid, 4 organic variants).
- 11 in-period marketing rows + 2 out-of-period rows. Paid-spend total
  ≈ ₪76k, organic-investment total ≈ ₪45k, grand total ≈ ₪121k.

### Spot-checked / ודאי-נומרית

A few explicit numeric checks beyond structural assertions:

- Blended CAC = 121000 / 9 = **₪13,444.44**
- Paid CAC    = 76000 / 5 = **₪15,200.00**
- Organic CAC = 45000 / 4 = **₪11,250.00**
- LinkedIn Ads channel CAC = 12000 / 1 = **₪12,000**;
  payback = 12000 / 8000 = **1.5 months**
- Blended payback ≈ 13,444.44 / 2,783.33 ≈ **4.83 months** (asserted
  within `[4.8, 4.9]`)

---

## 6. Design notes / הערות עיצוב

**Zero hidden state.** All methods are pure given the constructor's
input. Running `blendedCAC(period)` twice returns identical objects.
No memoization cache, no global singletons — this makes the class
trivially testable and safe inside a request handler.

**Injectable data.** The module does not know about Supabase, REST
endpoints, CSV files, or the Israeli chart of accounts. The caller
supplies two arrays and the class does the arithmetic. A thin
`cac-routes.js` wrapper can be added later to plug the Postgres
`customer` + `marketing_spend` tables into it.

**Date handling.** Every date is normalized to a UTC ISO string inside
`toISODate()`, so marketing rows stored with a `Date` object, an ISO
string, or a legacy `YYYY-MM-DD` short form all land in the right
month bucket regardless of the caller's timezone.

**Rounding discipline.** All currency math goes through `r2()`
(2-decimal) and all ratios / months go through `r4()` (4-decimal).
This avoids the classic 0.1 + 0.2 = 0.30000000000000004 drift that
breaks `assert.equal` comparisons.

**Israeli context.** Currency defaults to `ILS`; line-item defaults
include Hebrew-first labels (שכר צוות שיווק, יחסי ציבור, קידום
אורגני, etc.). Easy to override for USD / EUR entities inside the
holding structure.

---

## 7. Compliance with the rules / עמידה בכללים

| Rule / כלל                                                              | Evidence / הוכחה                                                              |
|-------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| Never delete anything / לא מוחקים כלום                                  | Git status shows only two new files in new directories + this report         |
| Node built-ins only / רק ספריות פנימיות                                  | `grep -n '^const .* = require' src/reporting/cac-dashboard.js` → **no lines** |
| Bilingual output / פלט דו-לשוני                                          | `LABELS` dictionary + T26 asserts `label.he` + `label.en` on every return     |
| ≥ 15 unit tests / לפחות 15 בדיקות                                        | Delivered **27** tests, all green                                             |
| Class `CACDashboard` / מחלקה `CACDashboard`                              | `class CACDashboard { ... }` in `cac-dashboard.js`                            |
| blendedCAC / byChannel / bySegment / paybackPeriod / trend / lineItem   | All 6 required methods + `paidCAC`, `organicCAC`, `summary` (9 total)        |

---

## 8. How to run / אופן הרצה

```bash
cd onyx-procurement
node --test test/reporting/cac-dashboard.test.js
```

Expected tail / פלט צפוי:
```
ℹ tests 27
ℹ pass 27
ℹ fail 0
```

---

## 9. Possible next steps / צעדים הבאים אפשריים

Strictly outside the scope of this ticket — listed only as a backlog hint.

1. **HTTP wrapper** — `src/reporting/cac-routes.js` exposing
   `GET /api/reporting/cac?period=...` bound to the Express app.
2. **Postgres adapter** — SQL that materializes the `customers` and
   `marketing` arrays out of the `customers`, `invoices`,
   `marketing_line_items` tables.
3. **PDF exporter** — reuse `pdfkit` rigging from `pnl-report.js`.
4. **Dashboard tile** — bind `byChannel` and `trend` to two SVG charts
   inside the existing `BIDashboard.jsx` shell from AG-99.
5. **Multi-touch attribution** — right now line-item attribution is
   proportional-to-spend; a future upgrade could read a weighted
   `touchpoints` ledger for first-touch / last-touch / W-shape models.

---

## 10. Sign-off / אישור

**EN.** Delivered a bilingual, fully-tested, zero-dependency CAC analytics
class for Techno-Kol Uzi's onyx-procurement codebase. The deliverable is
strictly additive, runs in under 200 ms on the full fixture suite, and
exposes every metric the spec requested plus three extras (`paidCAC`,
`organicCAC`, `summary`). Ready to wire into the dashboard layer.

**HE.** סופק מודול CAC דו-לשוני, מבוסס בדיקות מלא, ללא תלויות חיצוניות,
עבור onyx-procurement של טכנו-קול עוזי. המסירה תוספית בלבד, רצה בפחות
מ-200 מ"ש על כל מערך הבדיקות, וחושפת כל מדד שהמפרט דרש ועוד שלוש פונקציות
נוספות (`paidCAC`, `organicCAC`, `summary`). מוכן להחברה לשכבת התצוגה.

— Agent Y-194, 2026-04-11.
