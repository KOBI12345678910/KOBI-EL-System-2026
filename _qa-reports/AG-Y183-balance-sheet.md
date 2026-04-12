# AG-Y183 — Balance Sheet Explorer / מאתר המאזן

**Agent**: Y-183
**Module**: `onyx-procurement/src/reporting/balance-sheet.js`
**Test file**: `onyx-procurement/test/reporting/balance-sheet.test.js`
**Date / תאריך**: 2026-04-11
**Status / סטטוס**: PASS — 21/21 tests green

---

## 1. Purpose / מטרה

**EN** — Deliver a dependency-free (Node built-ins only) balance sheet
explorer for the Techno-Kol Uzi mega-ERP that:

1. Classifies any chart-of-accounts entry into Israeli Tax Authority
   **Form 6111** line codes (IFRS-equivalent presentation).
2. Splits balances into **current** vs. **non-current**, and into
   **assets / liabilities / equity**.
3. Computes the full set of liquidity & leverage ratios:
   Current, Quick, Cash, Debt-to-Equity, Equity ratio, Leverage ratio.
4. Computes **working capital** and classifies health as
   healthy / tight / deficit.
5. Computes period-over-period **trend** analysis with direction
   (improving / stable / deteriorating).
6. Emits a **bilingual** (Hebrew + English) text report, with **NIS / ש״ח**
   formatting via `Intl.NumberFormat` (built-in).

**HE** — לספק מאתר מאזן חסר-תלויות (ספריות Node מובנות בלבד) עבור
מערכת ה-ERP של טכנו-קול עוזי אשר:

1. מסווג כל חשבון מתוך מבנה החשבונות לקודי **טופס 6111** של רשות המסים
   (הצגה מקבילה ל-IFRS).
2. מפצל יתרות ל-**שוטף** מול **לא-שוטף**, ול-**נכסים / התחייבויות / הון**.
3. מחשב את סט יחסי הנזילות והמינוף המלא:
   שוטף, מהיר, מזומן, חוב-להון, יחס הון, מינוף.
4. מחשב **הון חוזר** ומסווג את הבריאות כ-תקין / מתוח / גירעון.
5. מחשב ניתוח **מגמה** בין תקופות (משתפר / יציב / מתדרדר).
6. מפיק דוח טקסט **דו-לשוני** עם עיצוב **NIS / ש״ח** בעזרת
   `Intl.NumberFormat` המובנה.

---

## 2. Israeli GAAP / IFRS reference / אסמכתא ישראלית

| Item | Reference |
|------|-----------|
| Form 6111 line codes | רשות המסים — טופס 6111 נספח למס הכנסה |
| Accounting framework | **IFRS as adopted in Israel** — required for all public companies since 2008, widely voluntary for private companies |
| Legal basis | Israeli Companies Law 1999 §171 — Financial Statements |
| Corporate tax rate | 23% (since 2018, unchanged for 2026) |
| Currency | ILS / NIS / ש״ח |

The module never hard-codes regulatory numbers that can drift —
the Form 6111 map is exposed as a frozen constant so a CPA can
review & extend it additively.

**HE** — המודול אינו משריין מספרים רגולטוריים; מפת 6111 חשופה
כקבוע קפוא כך שרו"ח יכול לבדוק ולהרחיב אותה באופן תוסף-בלבד.

---

## 3. API surface / ממשק

```js
const { BalanceSheetExplorer } = require('./src/reporting/balance-sheet');

const explorer = new BalanceSheetExplorer({
  locale: 'he-IL',
  entityName: 'Techno-Kol Uzi Ltd.',
  entityNameHe: 'טכנו-קול עוזי בע״מ',
});

// classify a single account
explorer.classify({ code: '1100', name: 'Accounts receivable' });
// → { side:'asset', term:'current', key:'accountsReceivable', ... }

// build a full sheet
const sheet = explorer.build(accounts, {
  periodStart: '2026-01-01',
  periodEnd:   '2026-03-31',
  label:       '2026-Q1',
});

// ratios & working capital are already on the sheet
sheet.ratios.current;          // e.g. 2.28
sheet.workingCapital.status;   // 'healthy' | 'tight' | 'deficit'

// trend across multiple sheets
explorer.trend([q1Sheet, q2Sheet, q3Sheet]);
//   → { direction:'improving', deltas:[...], summary:{he,en} }

// bilingual text report
const txt = explorer.formatReport(sheet);
```

---

## 4. Form 6111 coverage / כיסוי טופס 6111

The classifier currently ships with **38 Form 6111 line codes** covering
all standard balance sheet categories:

- **Current assets** (1000-1300): cash, bank deposits, marketable
  securities, A/R, notes receivable, VAT receivable, inventory, WIP,
  prepaid expenses.
- **Non-current assets** (1400-1700): long-term receivables &
  investments, PP&E, accumulated depreciation (contra), intangibles,
  goodwill, deferred tax assets.
- **Current liabilities** (2000-2220): short-term loans, overdraft,
  A/P, notes payable, accrued expenses, VAT payable, income tax payable,
  payroll payable, Bituach Leumi payable, deferred revenue,
  customer advances, current portion of LT debt.
- **Non-current liabilities** (2300-2600): LT loans, bonds,
  severance reserve, deferred tax liabilities, lease obligations.
- **Equity** (3000-3400): share capital, capital reserves, retained
  earnings, treasury shares (contra), minority interest.

Contra accounts (`1510` accumulated depreciation, `3300` treasury shares)
are flagged with `contra: true` and subtract from their category total
in `build()`.

---

## 5. Test matrix / מטריצת בדיקות

| # | Test | Area | Result |
|---|------|------|--------|
| 1 | classify: explicit Form 6111 code maps to current asset cash | classify | PASS |
| 2 | classify: code prefix ("1100-SPK") still resolves | classify | PASS |
| 3 | classify: Hebrew keyword "מלאי" → inventory | classify-he | PASS |
| 4 | classify: English "Long-term loan" → non-current liability | classify-en | PASS |
| 5 | classify: unknown account yields "unknown" with reason | classify | PASS |
| 6 | build: produces balanced assets = liabilities + equity | build | PASS |
| 7 | build: accumulated depreciation is treated as contra asset | contra | PASS |
| 8 | ratios: current, quick and cash ratios are correct | ratios | PASS |
| 9 | ratios: D/E and equity ratio match manual calc | ratios | PASS |
| 10 | ratios: zero denominators return null (no NaN / Infinity) | safety | PASS |
| 11 | workingCapital: classifies healthy / tight / deficit | working-cap | PASS |
| 12 | trend: detects improving working-capital direction | trend | PASS |
| 13 | trend: detects deteriorating direction | trend | PASS |
| 14 | formatReport: contains both Hebrew and English headers | i18n | PASS |
| 15 | formatReport: NIS / ₪ formatting appears in output | i18n | PASS |
| 16 | build: reference includes Form 6111 and IFRS | compliance | PASS |
| 17 | build: unknown accounts retained in unclassified (never deleted) | rule | PASS |
| 18 | helpers: formatNIS handles NaN and returns em-dash | helpers | PASS |
| 19 | helpers: r2 rounds to 2 decimals (no float drift) | helpers | PASS |
| 20 | FORM_6111: map is frozen (immutable / additive-only) | rule | PASS |
| 21 | build: rejects non-array input with bilingual error | safety | PASS |

**Total**: 21 tests — **21 pass / 0 fail** (exceeds the 15+ requirement).

---

## 6. Rules compliance / עמידה בכללים

| Rule | Status | Evidence |
|------|:---:|----------|
| Never delete data | OK | Unknown accounts go to `bs.unclassified` (test #17); `FORM_6111` is `Object.freeze`d (test #20). |
| Node built-ins only | OK | `require` only pulls `node:test` and `node:assert/strict`; `Intl` used for currency formatting (built-in); no `package.json` changes. |
| Bilingual (he + en) | OK | Every Form 6111 entry has `he` + `en`; classification returns `nameHe`+`nameEn`; report has both headers (test #14); errors carry both languages (test #21). |
| Form 6111 classification | OK | 38 codes mapped, explicit+prefix+keyword fallback (tests #1-4). |
| Current / non-current split | OK | `assets.current` / `assets.nonCurrent` etc. on the sheet object; test #6 verifies totals. |
| Liquidity ratios | OK | current, quick, cash implemented with divide-by-zero safety (tests #8, #10). |
| Working capital | OK | `workingCapital()` returns value, status, he+en labels (test #11). |
| NIS formatting | OK | `formatNIS()` uses `Intl.NumberFormat('he-IL', { style:'currency', currency:'ILS' })`; test #15. |
| Israeli GAAP reference | OK | Every `build()` result embeds `reference.form6111` and `reference.gaap` (test #16). |

---

## 7. How to run / כיצד להריץ

```bash
cd onyx-procurement
node --test test/reporting/balance-sheet.test.js
```

Example output / פלט לדוגמה:

```
ℹ tests 21
ℹ suites 0
ℹ pass 21
ℹ fail 0
ℹ duration_ms ~150
```

---

## 8. Sample bilingual report excerpt / דוגמה לדוח דו-לשוני

```
════════════════════════════════════════════════════════════════════════
  BALANCE SHEET / מאזן
  Techno-Kol Uzi Ltd.  |  טכנו-קול עוזי בע״מ
  Period / תקופה: 2026-Q1  (2026-01-01 → 2026-03-31)
  Reference / אסמכתא:
    • Israel Tax Authority Form 6111 / טופס 6111 רשות המסים
    • IFRS as adopted in Israel / IFRS מאומץ בישראל
════════════════════════════════════════════════════════════════════════

ASSETS / נכסים
────────────────────────────────────────────────────────────────────────
  Current Assets / נכסים שוטפים:
    Cash & cash equivalents / מזומנים ושווי מזומנים       ₪120,000
    Bank deposits / פיקדונות בנקאיים                        ₪80,000
    Accounts receivable / לקוחות                           ₪250,000
    Inventory / מלאי                                       ₪180,000
    Prepaid expenses / הוצאות מראש                          ₪20,000
    Total Current / סה״כ שוטפים                            ₪650,000
  ...
KEY RATIOS / יחסים מרכזיים
  Current Ratio    / יחס שוטף       : 2.28
  Quick Ratio      / יחס מהיר        : 1.65
  Cash Ratio       / יחס מזומן       : 0.70
  Debt to Equity   / חוב להון        : 1.45
  Equity Ratio     / יחס הון         : 40.8%

WORKING CAPITAL / הון חוזר
  Value / ערך              : ₪365,000
  Status / סטטוס           : healthy / תקין
```

---

## 9. Known caveats / הסתייגויות

1. **CPA review pending** — the Form 6111 code map mirrors the
   published line codes but a licensed Israeli CPA should validate
   before the numbers hit an actual tax submission.
2. **Goodwill & deferred tax signs** — the module treats them as
   positive asset balances; consolidation adjustments (impairment,
   reversal) must be posted as separate journal entries upstream.
3. **Currency translation** — multi-currency sheets require FX
   normalization upstream. The explorer assumes all balances arrive
   already in ILS.

---

## 10. Files delivered / קבצים שסופקו

| File | LOC | Purpose |
|------|---:|---------|
| `onyx-procurement/src/reporting/balance-sheet.js` | ~570 | Module implementation |
| `onyx-procurement/test/reporting/balance-sheet.test.js` | ~290 | 21 unit tests |
| `_qa-reports/AG-Y183-balance-sheet.md` | this file | Bilingual QA report |

All three files are **new** and **additive** — no existing file was
edited or deleted.

**HE** — כל שלושת הקבצים חדשים ותוספתיים בלבד; שום קובץ קיים לא נערך
או נמחק.
