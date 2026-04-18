# AG-Y193 — Customer Lifetime Value Calculator / מחשבון ערך חיי לקוח

**Agent:** Y-193
**Date / תאריך:** 2026-04-11
**Project:** onyx-procurement (Techno-Kol Uzi mega-ERP)
**Rule of engagement / כלל עבודה:** append-only — nothing deleted / לא נמחק דבר
**Dependencies:** zero third-party — Node built-ins only / אין תלויות צד-שלישי

---

## 0. Executive summary / תקציר מנהלים

EN — New reporting module that computes Customer Lifetime Value using
three complementary methods (historical, predictive cohort-based,
discounted cash flow) with segment-level roll-ups, LTV/CAC ratio, and
three-band health classification. 24 unit tests, all green. Hebrew-first
bilingual output on every user-facing field.

HE — נוסף מודול חדש למחשב ערך חיי לקוח (LTV) בשלוש שיטות משלימות —
היסטורית, חיזויית (cohort), ומהוונת (DCF) — עם סיכום לפי מקטעים,
יחס LTV/CAC, ושלוש רמות בריאות. 24 בדיקות יחידה, כולן ירוקות.
פלט דו-לשוני עברית-ראשית בכל שדה הפונה למשתמש.

| Item / פריט                          | Status / סטטוס |
|--------------------------------------|----------------|
| Core module created                  | done / הושלם   |
| Public API surface                   | 9 methods      |
| Three LTV methods                    | done           |
| Segment roll-up                      | done           |
| LTV/CAC + health bands               | done           |
| Test suite (`node:test`)             | 24 / 24 green  |
| Bilingual HE/EN output               | done           |
| Zero third-party dependencies        | confirmed      |
| Files touched destructively          | none / אפס     |

---

## 1. Artefacts / תוצרים

| File                                                             | LOC  | Purpose / ייעוד                |
|------------------------------------------------------------------|-----:|--------------------------------|
| `onyx-procurement/src/reporting/ltv-calculator.js`               |  460 | main module / מודול ראשי       |
| `onyx-procurement/test/reporting/ltv-calculator.test.js`         |  270 | 24 test cases / בדיקות         |
| `_qa-reports/AG-Y193-ltv-calculator.md`                          |    — | this report / דוח זה            |

Two new directories were created (they did not previously exist):
`src/reporting/` and `test/reporting/`. No existing file was altered.

---

## 2. Public API / ממשק ציבורי

```js
const { LTVCalculator } = require('./src/reporting/ltv-calculator');
const calc = new LTVCalculator({
  period: 'year',                // 'month' | 'quarter' | 'year'
  projectedPeriods: 5,           // horizon for predictive / DCF
  defaultChurnRate: 0.15,
  wacc: { riskFreeRate: 0.046, beta: 1.10 /* ... */ },
});

calc.historicalLTV(customer);        // realised gross margin
calc.predictiveLTV(customer, opts);  // cohort-churn bounded geometric
calc.discountedLTV(customer, opts);  // NPV via WACC
calc.cohortChurnRate(cohort, ref);   // utility
calc.computeWACC(overrides);         // Israeli 10Y + β·ERP + size
calc.segmentLTV(customers, 'segment');
calc.ltvCacRatio(ltv, cac);
calc.healthBand(ratio);              // bad / ok / good
calc.summary(customers, opts);       // full bilingual dashboard payload
```

### Input contract / חוזה קלט
```js
{
  id, name, segment,
  acquisitionDate,
  acquisitionCost,     // CAC
  cohortId?,
  churned, churnDate?,
  transactions: [{ id, date, revenue, cost, margin? }, ...]
}
```

Currency is ILS throughout; callers with sub-1-ILS precision
requirements should aggregate in integer agorot upstream.

---

## 3. Methodology / שיטה

### 3.1 Historical / היסטורי
EN — Sum of realised gross margin across all closed transactions.
This is the "what the customer has already given us" figure, with no
forward projection. Lifespan is measured from first transaction to
either the churn date or the latest transaction.

HE — סכום הרווחים הגולמיים בפועל לכל העסקאות הסגורות. זוהי
"מה הלקוח כבר נתן לנו", ללא חיזוי קדימה. אורך החיים נמדד
מהעסקה הראשונה ועד לעזיבה או לעסקה האחרונה.

```
totalMargin      = Σ (revenue_i − cost_i)
avgMarginPerPeriod = totalMargin / (lifespanDays / DAYS_PER_PERIOD)
value            = totalMargin
```

### 3.2 Predictive (cohort) / חיזויי (קבוצת-עמיתים)
EN — Uses a bounded geometric sum so the value converges even at
very low churn:
```
LTV_pred = avgMarginPerPeriod × (1 − (1 − churn)^N) / churn
```
Churn rate is derived from peer customers sharing the same
`cohortId` (`YYYY-Q#_segment` fallback if not supplied). Capped at
95 % to prevent divide-by-zero and extreme values.

HE — שיטה חיזויית לפי קבוצת עמיתים. שימוש בסדרה גיאומטרית
חסומה כך שהערך מתכנס גם בערכי עזיבה נמוכים מאוד. שיעור העזיבה
מחושב מלקוחות באותה קבוצת עמיתים (cohort). מוגבל ב-95% כדי
למנוע חלוקה באפס.

### 3.3 Discounted (DCF) / מהוון (היוון תזרים מזומנים)
EN — NPV of projected per-period cashflows:
```
WACC         = (E/V)·Re + (D/V)·Rd·(1 − tax)
Re           = Rf + β · ERP + sizePremium
periodicWACC = (1 + WACC)^(days/365.25) − 1
LTV_disc     = Σ (CF_t / (1 + periodicWACC)^t)   for t = 1..N
CF_t         = avgMarginPerPeriod × (1 − churn)^(t − 1)
```

HE — ערך נוכחי נקי של תזרימי מזומנים צפויים. מחושב לפי
נוסחת WACC סטנדרטית כאשר השיעור חסר הסיכון הוא תשואת אג"ח
ממשלתית ישראלית ל-10 שנים, ועליה מוסיפים פרמיית סיכון הון,
בטא תעשייתי ופרמיית גודל.

### 3.4 WACC defaults (April 2026 / ברירות מחדל אפריל 2026)
| Param / פרמטר        | Value / ערך |
|---------------------|------------:|
| Rf (BOI 10Y bond)   |   4.60 %    |
| Equity Risk Premium |   5.50 %    |
| β (industrial)      |   1.10      |
| Size premium        |   1.50 %    |
| Cost of debt        |   6.50 %    |
| Debt weight         |   0.00      |
| Corporate tax       |  23.00 %    |
| → Default WACC      | **12.15 %** |

These defaults are public-data-grade (Bank of Israel, TASE).
Audited reports must override them via constructor options.

### 3.5 Health bands / רמות בריאות
Locked to product spec:

| Ratio / יחס  | Band / רמה | HE       | EN    |
|--------------|-----------|----------|-------|
| < 1          | bad       | רע       | bad   |
| 1 ≤ r < 3    | ok        | סביר     | ok    |
| ≥ 3          | good      | טוב      | good  |

Unknown / missing CAC returns an explicit `unknown` band.

---

## 4. Test coverage / כיסוי בדיקות

**Harness / מסגרת:** `node --test` (built-in, zero dep).
**Count / מספר:** **24 tests, all green / 24 בדיקות, כולן ירוקות.**

```
✔ constructor: accepts defaults and merges WACC overrides
✔ constructor: rejects unknown period
✔ historicalLTV: sums gross margin exactly for 4 tx
✔ historicalLTV: bilingual label present
✔ historicalLTV: handles zero transactions gracefully
✔ historicalLTV: uses supplied margin field when present
✔ historicalLTV: rejects non-object input
✔ predictiveLTV: uses explicit cohortChurnRate when supplied
✔ predictiveLTV: derives churn from cohort array
✔ predictiveLTV: falls back to defaultChurnRate when cohort empty
✔ predictiveLTV: bounded — higher churn yields lower value
✔ cohortChurnRate: 2 of 5 contractors churned = 0.4
✔ computeWACC: equity-only default matches Rf+β·ERP+size
✔ computeWACC: applies debt tax shield
✔ discountedLTV: returns per-period breakdown and NPV
✔ discountedLTV: bilingual label present
✔ segmentLTV: groups by segment and ranks by predictive total
✔ ltvCacRatio: returns null ratio when CAC missing
✔ healthBand: classifies <1 as bad, 1-3 as ok, 3+ as good
✔ ltvCacRatio: accepts an LTV result object as first arg
✔ summary: full bilingual report for multi-customer set
✔ summary: totals.avgLtvCac is null when total CAC is zero
✔ cohortIdFor: generates YYYY-Qn_segment fallback
✔ deterministic: calling historicalLTV twice yields identical output

ℹ tests 24   pass 24   fail 0   cancelled 0   skipped 0
```

Coverage highlights / דגשי כיסוי:
- happy-path for all three LTV methods
- bilingual-label assertions for every user-facing return
- boundary cases: empty transactions, zero CAC, 95 % churn cap
- numeric invariants: lower churn ⇒ higher LTV, discounting ⇒ NPV < sum(CF)
- determinism: repeated calls produce identical output (no clock / no random)
- type safety: throws on non-object input

---

## 5. Hebrew-first bilingual output / פלט דו-לשוני

Every user-facing field exposes both languages:

```js
label: { he: 'LTV היסטורי', en: 'Historical LTV', bi: 'LTV היסטורי / Historical LTV' }
health.description: {
  he: 'יחס LTV/CAC מעל 3 — לקוח בריא ורווחי מאוד',
  en: 'LTV/CAC above 3 — highly profitable, healthy customer'
}
title: { he: 'סיכום ערך חיי לקוח', en: 'Customer Lifetime Value Summary' }
```

RTL safety — all Hebrew strings are bare Unicode (no embedded
direction marks), so the caller can wrap them as needed in RTL
containers without double-wrapping.

---

## 6. Israeli ERP specifics / סגולות ישראליות

- WACC defaults are sourced from **Bank of Israel 10Y bond**
  (Rf = 4.60 % as of 2026-04-11), TASE small-cap equity risk
  premium (5.50 %), industrial β (1.10), plus a 1.50 % size /
  illiquidity premium, and the **23 % Israeli corporate tax rate**
  for the debt-shield term.
- Segment key defaults to `'segment'`, which matches the existing
  Techno-Kol schema (`retail`, `contractor`, `municipal`, etc.).
- Currency is locked to **ILS** in the summary payload. Agorot-
  precision callers should aggregate upstream in integer agorot.
- Cohort fallback ID uses **Gregorian quarter**, matching TAX /
  VAT reporting periods in the rest of the codebase.

---

## 7. Commands for QA / פקודות ל-QA

```bash
# run tests
cd onyx-procurement
node --test test/reporting/ltv-calculator.test.js

# quick smoke from repl
node -e "
  const { LTVCalculator } = require('./src/reporting/ltv-calculator');
  const calc = new LTVCalculator();
  console.log(calc.computeWACC());         // 0.1215
  console.log(calc.healthBand(2.5).he);    // 'סביר'
"
```

---

## 8. Risks & follow-ups / סיכונים והמשכים

| # | Risk / סיכון | Mitigation / הפחתה |
|---|-------------|--------------------|
| 1 | Default WACC numbers go stale | Override via ctor options for audited reports |
| 2 | Cohort thinness (< 3 peers) | `defaultChurnRate` fallback |
| 3 | Margin field naming drift | Explicit `margin` field honoured if present |
| 4 | Currency mixing | Out of scope — single-currency by design (ILS) |

Future work (not required for this ticket): BG/NL cohort builder
from Beta-Geometric distribution; per-segment WACC premiums;
Weibull-based churn fitter for thin cohorts; persistence layer.

---

## 9. Sign-off / אישור

All three acceptance checks pass:
1. Three LTV methods implemented (historical, predictive, discounted) — ✅
2. Segment-level LTV, LTV/CAC ratio, three health bands — ✅
3. 15+ tests, bilingual, Node built-ins only, nothing deleted — ✅ (24 tests)

— Agent Y-193, Techno-Kol Uzi mega-ERP swarm, 2026-04-11
