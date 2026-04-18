# AG-Y189 — Budget vs Actual Engine / מנוע תקציב מול ביצוע

**Agent:** Y-189  
**Swarm:** Reporting / דיווח  
**Target ERP:** Techno-Kol Uzi mega-ERP (`onyx-procurement`)  
**Date:** 2026-04-11  
**Fiscal year under test:** FY 2026 (calendar year, per Israeli tax law /
סעיף 7 לפקודת מס הכנסה)

---

## 1. Mission / משימה

Deliver a zero-dependency, bilingual budget-vs-actual engine with rolling
forecasts, full-year outlook, and owner accountability, plus a full unit
test suite.

לספק מנוע בקרה תקציבית חסר-תלויות, דו-לשוני, הכולל תחזית מתגלגלת, תחזית
שנה שלמה ואחריות בעלים, לצד חבילת בדיקות יחידה מקיפה.

---

## 2. Deliverables / מוצרים מסופקים

| # | File / קובץ | Purpose / מטרה |
|---|---|---|
| 1 | `onyx-procurement/src/reporting/budget-actual.js` | Core engine / מנוע הליבה |
| 2 | `onyx-procurement/test/reporting/budget-actual.test.js` | 24 node-test unit tests / 24 בדיקות יחידה |
| 3 | `_qa-reports/AG-Y189-budget-actual.md` | This QA report / דו"ח QA זה |

Non-destructive additions only. No existing file was modified or removed.  
תוספות בלבד — לא נמחק ולא שונה אף קובץ קיים.

---

## 3. Public API / ממשק ציבורי

`class BudgetActual`

| Method | Signature | Responsibility |
|---|---|---|
| constructor | `new BudgetActual({ fiscalYear, unfavorableThresholdPct })` | Sets Israeli calendar fiscal year + default alert threshold (10%). |
| `loadBudget` | `loadBudget(period, lines)` | Ingests budget rows for a single fiscal month. Additive + audit-logged. |
| `loadActual` | `loadActual(period, lines)` | Ingests actual rows for a single fiscal month. Additive + audit-logged. |
| `computeVariance` | `computeVariance(period, lineId)` | Returns `{ absolute, percent, unfavorable, status_en, status_he, severity_* }`. Also accepts a single period to return an array of variances for every registered line. |
| `ytd` | `ytd(throughMonth)` | Year-to-date budget vs actual through the given month. |
| `fullYearOutlook` | `fullYearOutlook(throughMonth, { rollingWindow })` | Rolling forecast + annualization sanity check + projected full-year variance. |
| `ownerAssignment` | `ownerAssignment(lineId, { name, email, department, department_he })` | Assigns an accountable owner; prior owner preserved in `previous` + history. |
| `getOwner` | `getOwner(lineId)` | Current owner record. |
| `alerts` | `alerts({ throughMonth, thresholdPct, mode })` | Unfavorable-variance alerts with bilingual messages. `mode: 'ytd'` (default) or `'outlook'`. |
| `report` | `report(throughMonth)` | Bilingual structured report with YTD, projected FY, owners, totals, and alerts. |
| `history` | `history(lineId?)` | Immutable append-only audit trail. |
| `getLine` / `listLines` | — | Line registry access. |
| `fiscalYear` | `fiscalYear()` | Instance fiscal year. |
| `BudgetActual.fiscalYearFromDate(date)` | static | Convert any date to its Israeli fiscal year. |
| `BudgetActual.isCalendarFiscalYear()` | static | Always `true` — documents the design decision. |

### Constants exported
`DIRECTION`, `SEVERITY`, `MONTHS`, `MONTH_LABELS_HE`,
`DEFAULT_UNFAVORABLE_PCT`.

---

## 4. Design notes / הערות תכנון

### 4.1 Israeli fiscal year = calendar year
שנת המס בישראל זהה לשנה הקלנדרית עבור הרוב המוחלט של הנישומים
(סעיף 7 לפקודת מס הכנסה). ה-`constructor` דוחה כל עומס תקציבי/ביצועי
שאינו שייך לאותה שנה — `cross-year loadBudget` זורק `RangeError`. זו החלטה
מכוונת על-מנת שלא לרשום נתונים שנתיים מתחת לשנת כספים לא נכונה.

### 4.2 Bilingual by design / דו-לשוניות מובנית
Every line requires `label_en` + `label_he`. Every variance row, alert,
owner record, and report title carries both languages. `MONTH_LABELS_HE`
maps 1..12 to Hebrew month names for human-readable titles.

### 4.3 Never delete / לעולם לא מוחקים
- Every `loadBudget` / `loadActual` call appends a frozen entry to
  `_history` before mutating the current view.
- `ownerAssignment` writes the new owner record with a `previous` field
  pointing at the prior record; the prior record itself is also
  preserved in the history array with its own `OWNER` event.
- `history()` returns a shallow copy; the underlying records are
  `Object.freeze()`d so callers cannot rewrite the audit trail.

### 4.4 Direction-aware variance / שונות מודעת כיוון
`DIRECTION.EXPENSE` (default) → actual > budget is unfavorable.  
`DIRECTION.REVENUE` → actual < budget is unfavorable.  
The `unfavorable` boolean on every variance row embeds this rule so
consumers don't need category lookup tables.

### 4.5 Rolling forecast / תחזית מתגלגלת
`fullYearOutlook` blends three signals:
1. **YTD actual** — hard facts, no extrapolation.
2. **Rolling forecast** — mean of the last `rollingWindow` (default 3)
   months' actuals projected onto every remaining month. Falls back to
   the budgeted amount for a remaining month if no actuals exist yet.
3. **Annualization** — `ytdActual * (12 / throughMonth)` exposed as
   `annualized` so analysts can sanity-check the rolling forecast.

Variance is computed from `(projectedFullYear - fullYearBudget)`.

### 4.6 Alerts / התראות
Default threshold is 10% unfavorable. `alerts({ throughMonth })` uses
YTD variance (what already happened); `alerts({ throughMonth, mode:
'outlook' })` escalates based on the projected full year. Zero-budget
lines with nonzero actuals always escalate to `Critical / קריטי`.

### 4.7 Zero dependencies / ללא תלויות
Only `node:test` + `node:assert/strict` + `node:path` in the test file;
the engine itself uses nothing outside the language core.

---

## 5. Test matrix / מטריצת בדיקות

`test/reporting/budget-actual.test.js` — **24 tests**.

| # | Test / בדיקה | What it proves |
|---|---|---|
| 01 | Constructor defaults + Israeli FY alignment | Defaults + boundary checks |
| 02 | Period normalization (ISO / named / numeric / object) | Parser correctness + bad-input rejection |
| 03 | `loadBudget` registers bilingual line | Metadata is preserved |
| 04 | `loadBudget` summed across 12 months | Accumulation math |
| 05 | `loadActual` additive + history preserved | Never-delete invariant |
| 06 | Favorable expense variance | Sign + status wording |
| 07 | Unfavorable expense >10% | Severity = Warning |
| 08 | Revenue direction flipped | Direction-aware logic |
| 09 | On-target zero variance | Exact-zero status path |
| 10 | Zero-budget line with actual spend | Infinite percent handling |
| 11 | YTD aggregation through given month | Correct cumulative math |
| 12 | Rolling forecast from recent actuals | Rolling-window math |
| 13 | Annualization sanity | `ytdActual * 12/m` is surfaced |
| 14 | Owner assignment bilingual | `department` + `department_he` kept |
| 15 | Reassignment preserves prior owner | Never-delete invariant for owners |
| 16 | >10% unfavorable alert bilingual | `message_en` + `message_he` |
| 17 | Custom threshold | Threshold override works |
| 18 | Favorable variance never triggers | No false positives |
| 19 | Report bilingual title + totals | Report skeleton |
| 20 | Report embeds owner in alerts | Owner flows through to alerts |
| 21 | History append-only + frozen | Audit-trail immutability |
| 22 | Fiscal year helpers | Static + instance alignment |
| 23 | Cross-year `loadBudget` rejected | Fiscal boundary enforcement |
| 24 | Bad amount / missing id throws | Input validation |

### Execution result / תוצאת הרצה

```
$ node --test test/reporting/budget-actual.test.js
...
ℹ tests 24
ℹ suites 0
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

כל 24 הבדיקות עוברות.  All 24 tests pass.

---

## 6. Worked example / דוגמה מעשית

```js
const { BudgetActual, DIRECTION } = require('./src/reporting/budget-actual');

const ba = new BudgetActual({ fiscalYear: 2026 });

for (let m = 1; m <= 4; m++) {
  ba.loadBudget({ year: 2026, month: m }, [
    { id: 'RENT',    amount: 10_000, label_en: 'Office Rent', label_he: 'שכר דירה' },
    { id: 'PAYROLL', amount: 50_000, label_en: 'Payroll',     label_he: 'שכר עובדים' },
    { id: 'REVENUE', amount: 80_000, label_en: 'Product Sales', label_he: 'מכירות מוצר', direction: DIRECTION.REVENUE },
  ]);
}

ba.loadActual('2026-01', [{ id: 'PAYROLL', amount: 52_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
ba.loadActual('2026-02', [{ id: 'PAYROLL', amount: 55_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
ba.loadActual('2026-03', [{ id: 'PAYROLL', amount: 60_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);
ba.loadActual('2026-04', [{ id: 'PAYROLL', amount: 62_000, label_en: 'Payroll', label_he: 'שכר עובדים' }]);

ba.ownerAssignment('PAYROLL', { name: 'עוזי כהן', email: 'uzi@technokoluzi.co.il', department: 'Finance', department_he: 'כספים' });

const outlook = ba.fullYearOutlook(4, { rollingWindow: 3 });
const rpt = ba.report(4);
const alerts = ba.alerts({ throughMonth: 4 });
```

`rpt.title_en`  → `Budget vs Actual — FY 2026 through month 4`  
`rpt.title_he`  → `תקציב מול ביצוע — שנת כספים 2026 עד חודש 4 (אפריל)`

---

## 7. Compliance checklist / רשימת תאימות

- [x] Node built-ins only (no `npm install` required)  
- [x] Bilingual labels on every public output  
- [x] Never deletes (history-first, frozen audit records)  
- [x] Israeli fiscal year = calendar year enforced  
- [x] >10% unfavorable variance triggers alert  
- [x] Owner accountability with previous-owner preservation  
- [x] Rolling forecast + annualization + full-year outlook  
- [x] 15+ unit tests (delivered 24, all passing)  
- [x] Bilingual QA report (this document)

---

## 8. Operator runbook / מדריך הפעלה

```bash
# Run the suite locally
cd onyx-procurement
node --test test/reporting/budget-actual.test.js

# Expected: tests 24 / pass 24 / fail 0
```

For wiring into the existing reporting stack, instantiate `BudgetActual`
per tenant, feed monthly GL balances via `loadActual`, and surface
`report(currentMonth)` through any JSON/HTML renderer. The engine
itself does no I/O and is safe to embed in handlers, cron jobs, or the
existing job runner.

---

*— סוף דו"ח AG-Y189 / End of report —*
