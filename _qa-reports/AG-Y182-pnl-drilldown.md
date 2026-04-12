# AG-Y182 — P&L Drill-Down Engine / מנוע פירוט דוח רווח והפסד

**Agent:** AG-Y182
**Swarm:** Reporting / דיווח ניהולי
**Wave:** 2026
**Date:** 2026-04-11
**Project:** Techno-Kol Uzi Mega-ERP (Kobi EL)
**Module file:** `onyx-procurement/src/reporting/pnl-drilldown.js`
**Test file:**  `onyx-procurement/test/reporting/pnl-drilldown.test.js`
**Status:** GREEN — 31 / 31 tests passing (18 spec-mandated groups met)
**Rule of engagement:** לא מוחקים רק משדרגים ומגדלים — append-only, never destructive.

---

## 1. Mission / משימה

**EN:** Build a hierarchical P&L drill-down engine over the Israeli chart of
accounts (mapped to Form 6111 row codes), producing a tree with variance
analysis vs. prior period, variance vs. budget, contribution %, and
gross/operating/net margin at every node. Bilingual (Hebrew + English)
throughout. Node.js built-ins only, zero external deps.

**HE:** לבנות מנוע פירוט היררכי לדוח רווח והפסד מעל מצבת חשבונות ישראלית
(תקינה ישראלית → שורות טופס 6111), המפיק עץ מלא עם ניתוח סטיות מול תקופה
מקבילה, סטיות מול תקציב, שיעור תרומה לרמה מעליה, ושוליי רווח גולמי/תפעולי/נקי
בכל צומת. דו-לשוני (עברית + אנגלית) לכל אורכו. תלוי רק ב-Node.js — ללא חבילות
צד שלישי.

---

## 2. Deliverables / תוצרים

| File / קובץ | Purpose / מטרה |
|---|---|
| `onyx-procurement/src/reporting/pnl-drilldown.js` | Engine — class `PnLDrilldown` + helpers |
| `onyx-procurement/test/reporting/pnl-drilldown.test.js` | 31 unit tests (`node --test`) |
| `_qa-reports/AG-Y182-pnl-drilldown.md` | This report |

Zero files deleted. Zero npm dependencies added.

---

## 3. Statutory & Accounting References / מקורות

| Framework | Reference / מקור | Purpose |
|---|---|---|
| Israeli Tax | טופס 6111 — דוח מתואם לצורכי מס, מבנה שורות רשות המסים | COA → tax row mapping |
| Israeli Tax | פקודת מס הכנסה [נוסח חדש], תשכ"א-1961 — §126 | Corporate tax rate (23%) |
| ISRAELI_TAX_CONSTANTS_2026.md | Corporate tax = 23% since 2018 | Synthetic tax line |
| Israeli Tax | חוק חברות, תשנ"ט-1999 | Financial-statement structure |

The Form 6111 row ranges implemented are aligned with the existing canonical
mapping in `onyx-procurement/src/tax/form-6111.js` (Agent Y-002).

---

## 4. Architecture / ארכיטקטורה

### 4.1 Class — `PnLDrilldown`

```
new PnLDrilldown({ locale, corporateTaxRate, strict })
  .buildTree(accounts, amounts)       → root nodes
  .drill(accountCode)                 → node + path + sorted children
  .varianceVsPrior(accountCode)       → {absolute, percent, direction, favorable}
  .varianceVsBudget(accountCode)      → variance object
  .contribution(accountCode)          → % of parent.current
  .getMargins(accountCode?)           → {grossMargin, operatingMargin, netMargin}
  .form6111LineOf(accountCode)        → {row, section:{id, he, en}}
  .form6111Summary()                  → section buckets aggregated from leaves
  .walk(startCode?)                   → depth-first iterator
  .toJSON()                           → plain serialisable snapshot
  .renderReport({lang:'he'|'en'|'bi'})→ bilingual markdown text report
```

### 4.2 Data contract / חוזה נתונים

```js
Account = {
  code: '4000',
  parentCode: null | '3000',
  he: 'הכנסות ממכירות',      // bilingual names
  en: 'Sales revenue',
  type: 'revenue'|'cogs'|'expense'|'financial'|'tax'|'other',
  form6111Row?: 1010,        // optional explicit row code
}

Amount = {
  code: '4000',
  current: 125000,           // NIS, signed magnitude
  prior?:   110000,
  budget?:  120000,
}
```

### 4.3 Internal pipeline / צנרת פנימית

```
accounts + amounts
    │
    ▼
 index amounts by code      (Map<code, {current, prior, budget}>)
    │
    ▼
 materialise bare nodes     (Map<code, Node>)
    │
    ▼
 wire parent ↔ child + detect cycles
    │
    ▼
 post-order roll-up         (leaves → roots)
    │
    ▼
 compute top-level totals   (revenue/cogs/expense/financial/tax/other)
    │
    ▼
 fill derived metrics       (contribution %, variances, margins)
    │
    ▼
 ready for drill(), getMargins(), renderReport()
```

---

## 5. Form 6111 Section Map / מפת שורות 6111

| ID | HE | EN | Range | Sign |
|---|---|---|---|---|
| `REVENUES` | הכנסות | Revenues | 1000–1999 | +1 |
| `COGS` | עלות המכירות | Cost of Goods Sold | 2000–2999 | -1 |
| `OPEX` | הוצאות תפעוליות | Operating Expenses | 3000–4999 | -1 |
| `FINANCIAL` | הכנסות והוצאות מימון | Financial Items | 5000–5999 | -1 |
| `EXTRAORDINARY` | הכנסות והוצאות חד-פעמיות | Extraordinary Items | 6000–6999 | -1 |

Full mapping is aligned with `src/tax/form-6111.js` which is the canonical
statutory reference for the tax-authority filing.

---

## 6. Variance Semantics / סמנטיקת סטיות

For every numeric comparison (`current` vs `prior` or `current` vs `budget`)
the engine returns:

```
{
  absolute : r2(current - baseline),
  percent  : pctChange(current, baseline)  // null when baseline = 0
  direction: 'up' | 'down' | 'flat',
  favorable: true | false | null
}
```

**Favorability rules / כללי טובה:**

- Revenue node going **up** → favorable.
- Cost node (cogs/expense/financial) going **down** → favorable.
- Revenue going down / costs going up → **unfavorable**.
- `|delta| < 0.005` → direction `flat`, favorable `null`.

---

## 7. Margin Computation / חישוב שוליים

```
grossProfit     = revenue − cogs
operatingProfit = grossProfit − opex
preTaxProfit    = operatingProfit − financial + extraordinary
tax             = preTaxProfit × corporateTaxRate   (if no explicit tax bucket)
netProfit       = preTaxProfit − tax

grossMargin     = grossProfit     / revenue × 100
operatingMargin = operatingProfit / revenue × 100
netMargin       = netProfit       / revenue × 100
```

At **node level** (non-root), margins express the node's share of each
profit line as a percentage of total revenue, signed by the node's type.

**Worked example (fixtures):**

| Line | Current | % of Revenue |
|---|---:|---:|
| Revenue | 1,000,000 ₪ | 100.00% |
| COGS | 400,000 ₪ | 40.00% |
| Gross Profit | 600,000 ₪ | **60.00%** |
| OPEX | 300,000 ₪ | 30.00% |
| Operating Profit | 300,000 ₪ | **30.00%** |
| Finance Net | 20,000 ₪ | 2.00% |
| Pre-Tax Profit | 280,000 ₪ | 28.00% |
| Corporate Tax (23%) | 64,400 ₪ | 6.44% |
| **Net Profit** | **215,600 ₪** | **21.56%** |

---

## 8. NIS Formatting / פורמט שקלים

```js
formatNIS(1234.5)   →  '‏1,234.50 ₪'   (he-IL locale via Intl)
formatNIS(null)     →  '0.00 ₪'
formatPct(12.345)   →  '12.35%'
formatPct(null)     →  '—'
```

Falls back to a hand-rolled ₪ suffix when the runtime lacks the full Intl
ICU (very old Node builds). Locale is configurable via constructor option.

---

## 9. Test Coverage / כיסוי בדיקות

**Run:** `node --test onyx-procurement/test/reporting/pnl-drilldown.test.js`

**Result:** `pass 31 / fail 0 / skipped 0` — duration ≈ 175 ms.

| # | Group | Test name |
|---|---|---|
| 1 | helpers | `pctChange handles base=0 …` |
| 2 | helpers | `formatNIS produces a currency string …` |
| 3 | helpers | `formatPct prints "—" for null …` |
| 4 | resolver | `resolveSection maps row codes to Form 6111 sections` |
| 5 | resolver | `resolvePnlType honours explicit type then falls back …` |
| 6 | buildTree | `wires parents, children, roots, and depth correctly` |
| 7 | buildTree | `rolls amounts up from leaves to parents` |
| 8 | buildTree | `rejects malformed input in strict mode` |
| 9 | buildTree | `detects cycles in the hierarchy` |
| 10 | totals | `correct gross / operating / net profits` |
| 11 | margins | `top-level margins come out to 60% / 30% / ~21.56%` |
| 12 | variance | `varianceVsPrior reports absolute, percent, direction, favorability` |
| 13 | variance | `varianceVsBudget null when no budget row exists on a subtree` |
| 14 | variance | `varianceObj correctly flags flat (near-zero delta)` |
| 15 | contribution | `contribution() returns child share of parent current` |
| 16 | drill | `drill returns node + path + sorted children with formatted amounts` |
| 17 | drill | `drill throws on unknown account code` |
| 18 | drill | `drill path builds ancestors for deep nodes` |
| 19 | 6111 | `form6111LineOf returns the row + section descriptor` |
| 20 | 6111 | `form6111Summary aggregates leaves into section buckets` |
| 21 | report | `renderReport produces a bilingual markdown …` |
| 22 | report | `renderReport obeys lang=he and lang=en exclusivity` |
| 23 | safety | `buildTree does not mutate caller input (append-only rule)` |
| 24 | snapshot | `toJSON produces a plain serialisable snapshot` |
| 25 | walk | `walk iterates every node in the tree` |
| 26 | walk | `walk(startCode) iterates only a subtree` |
| 27 | config | `custom corporateTaxRate propagates to net profit` |
| 28 | export | `SECTION_MAP has the expected 5 sections with bilingual labels` |
| 29 | export | `PNL_TYPE enum is frozen and contains the required buckets` |
| 30 | export | `CORPORATE_TAX_RATE_2026 is 0.23 (23% since 2018)` |
| 31 | internals | `_internals r2 rounds correctly` |

Spec required 15+ tests. Delivered **31**.

---

## 10. Fixture / Synthetic Data / נתוני בדיקה

The test file uses a 16-account synthetic COA:

```
1000 Revenues (הכנסות)                root
 ├─ 1010 Domestic sales       700,000
 ├─ 1020 Export sales         250,000
 └─ 1300 Other revenue         50,000
2000 COGS (עלות המכירות)              root
 ├─ 2010 Raw materials        180,000
 ├─ 2100 Direct labor         150,000
 └─ 2200 Manufacturing OH      70,000
3000 Operating exp. (הוצאות תפעול)    root
 ├─ 3100 Salaries             150,000
 ├─ 3200 Rent                  60,000
 ├─ 3600 Marketing             50,000
 └─ 4000 Depreciation          40,000
5000 Financial (מימון)                root
 ├─ 5110 Bank interest         15,000
 └─ 5130 Bank charges           5,000
```

Totals roll up to: `revenue = 1,000,000`, `cogs = 400,000`,
`opex = 300,000`, `financial = 20,000`, `tax = 64,400`, `net = 215,600 ₪`.

---

## 11. Append-Only Guarantee / הבטחת אי-מחיקה

1. `buildTree` clones the input arrays with a shallow spread before touching
   anything — caller input is never mutated.
2. The test **"buildTree does not mutate caller input"** snapshots the
   input via `JSON.stringify`, runs the full pipeline (build + drill +
   render), and asserts the snapshot is still byte-identical.
3. No `delete`, `splice`, `shift` or `.length = 0` anywhere in the source.
4. Writing to the file system / network / database is **not** attempted —
   the engine is pure compute.

---

## 12. Open Items / תלויות פתוחות

| # | Item | Owner |
|---|---|---|
| 1 | Full 6111 COA cross-wiring (reuse `COA_MAP` from `form-6111.js`) | Reporting swarm |
| 2 | Optional PDF renderer bridge via `documents/pdf-form-filler.js` | DocsGen swarm |
| 3 | Frontend dashboard card consuming `drill()` directly | UI wave |
| 4 | Multi-currency (ILS + USD/EUR) — currently single currency | FX swarm |

None of the above block GREEN status — all are enhancements for future
waves.

---

## 13. Verdict / החלטה

**EN:** **GREEN.** 31/31 tests pass. Zero external deps. Append-only verified.
Bilingual output verified. Form 6111 section mapping matches the canonical
tax module. Ready for integration into management reporting UI.

**HE:** **ירוק.** 31 מתוך 31 בדיקות עוברות. אין תלויות חיצוניות. אי-מחיקה
אומתה. פלט דו-לשוני אומת. מיפוי שורות טופס 6111 תואם את מודול המס הקנוני.
מוכן לשילוב בממשק הדיווח הניהולי.

---

_Generated by Agent Y-182 / PnLDrilldown — Techno-Kol Uzi mega-ERP, Wave 2026._
_לא מוחקים רק משדרגים ומגדלים._
