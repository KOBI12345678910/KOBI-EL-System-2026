# AG-Y087 — Aging Reports Engine (AR + AP) / מנוע דוחות גיול

**Agent:** Y-087
**Module:** `onyx-procurement/src/finance/aging-reports.js`
**Tests:** `onyx-procurement/test/finance/aging-reports.test.js`
**Wave:** 2026
**Status:** GREEN — 27 / 27 tests passing
**House rule:** לא מוחקים רק משדרגים ומגדלים

---

## 1. Purpose / מטרה

| EN | HE |
|----|----|
| Stateless, deterministic aging engine for AR (Accounts Receivable) and AP (Accounts Payable), with KPIs (DSO / DPO), concentration risk (top-10 / HHI), bilingual CSV + PDF payloads, variance between periods, and alerts. | מנוע חישוב דוחות גיול לחייבים (לקוחות) וזכאים (ספקים), כולל מדדי מפתח (DSO / DPO), סיכון ריכוזיות (10 עליונים / HHI), ייצוא CSV + PDF דו-לשוני, השוואות בין תקופות, והתראות. |

This is the **v2** engine. The legacy `aging.js` (same directory) is untouched — in line with the immutable rule "לא מוחקים רק משדרגים ומגדלים", v2 sits alongside as an upgrade and provides the modern KPI surface area expected by the new dashboard.

---

## 2. Files delivered

| Path | Bytes | Role |
|------|-------|------|
| `onyx-procurement/src/finance/aging-reports.js` | ~18 KB | `AgingReports` class + pure helpers |
| `onyx-procurement/test/finance/aging-reports.test.js` | ~11 KB | 27 node:test assertions |
| `_qa-reports/AG-Y087-aging-reports.md` | this file | QA report (bilingual) |

---

## 3. Public API

```js
const { AgingReports, DEFAULT_BUCKETS_V2, HEBREW_GLOSSARY_V2 } =
  require('./src/finance/aging-reports.js');

const engine = new AgingReports({ currency: 'ILS' });

engine.arAging(invoices, asOfDate, { buckets });
engine.apAging(bills, asOfDate, { buckets });
engine.dsoCalculation({ invoices, period, revenue });
engine.dpoCalculation({ bills, period, cogs });
engine.customerAging(customerId, invoices, asOfDate);
engine.vendorAging(vendorId, bills, asOfDate);
engine.topDelinquents(invoices, limit, asOfDate);
engine.exportCSV(report);
engine.exportPDF(report);
engine.variance(currentReport, priorReport);
engine.alerts({ threshold, bucket }, report);
engine.concentrationRisk(invoices);
```

Input schema (AR invoices / AP bills share the same shape):

```js
{
  id         : 'INV-001',
  customerId : 'CUST-A',        // or vendorId on AP
  amount     : 1000,
  issueDate  : '2026-03-22',
  dueDate    : '2026-04-01',
  paidDate   : null,            // null/undefined ⇒ still open
  currency   : 'ILS',
}
```

---

## 4. Bucket definitions / הגדרות דליים

| Bucket (EN) | דלי (HE) | Range (days overdue) |
|-------------|----------|----------------------|
| 0-30        | 0-30 ימים      | `0 ≤ d ≤ 30`       |
| 31-60       | 31-60 ימים     | `31 ≤ d ≤ 60`      |
| 61-90       | 61-90 ימים     | `61 ≤ d ≤ 90`      |
| 91-180      | 91-180 ימים    | `91 ≤ d ≤ 180`     |
| 180+        | מעל 180 ימים    | `d ≥ 181`          |

### Convention

- `d = daysBetween(asOfDate, invoice.dueDate)`  → positive means overdue.
- Negative `d` (invoice not yet due) is clamped to 0 and placed in the **0-30** bucket as "current".
- Boundaries are inclusive on both sides (`d = 30` ⇒ 0-30; `d = 31` ⇒ 31-60).
- The **180+** bucket is open-ended (`max = Infinity`).
- Buckets are overrideable per-call via the `{ buckets }` option, or per-instance via the constructor.

---

## 5. KPI formulas / נוסחאות מדדי מפתח

### 5.1 DSO — Days Sales Outstanding / ימי גבייה ממוצעים

```
DSO = ( openAR / revenue ) * period
```

- **openAR**: sum of `amount` for invoices where `paidDate == null`.
- **period**: reporting period in days (30, 90, 365, …).
- **revenue**: total revenue for the same period.
- Guard: if `revenue ≤ 0` the function returns `{ dso: 0, note: 'zero_revenue' }` rather than dividing by zero.

### 5.2 DPO — Days Payable Outstanding / ימי תשלום ממוצעים

```
DPO = ( openAP / cogs ) * period
```

- **openAP**: sum of `amount` for bills where `paidDate == null`.
- **cogs**: cost of goods sold for the period.
- Guard: if `cogs ≤ 0` the function returns `{ dpo: 0, note: 'zero_cogs' }`.

### 5.3 Concentration risk / סיכון ריכוזיות

```
share_i   = openAR_i / ΣopenAR * 100
top10Share = Σ top 10 customers by openAR / ΣopenAR * 100
HHI        = Σ share_i²
```

Severity classification from `top10SharePct`:

| Range | Risk | `risk` field |
|-------|------|--------------|
| `≥ 80%`   | גבוה / High      | `"high"`   |
| `50–80%`  | בינוני / Medium  | `"medium"` |
| `< 50%`   | נמוך / Low       | `"low"`    |

### 5.4 Variance / פערים

```
delta     = current - prior
deltaPct  = (current - prior) / |prior| * 100
direction = worsened | improved | stable
```

`direction = 'worsened'` when `delta > 0` (more open balance), `'improved'` when `delta < 0`, `'stable'` at `delta == 0`. If `prior == 0` and `current > 0`, `deltaPct` becomes `Infinity` (documented behavior; covered by test 20).

### 5.5 Alerts / התראות

```
triggered   if  bucket.amount >= threshold
severity    'critical' if amount >= 2 * threshold, else 'warning'
```

Accepts an optional `bucket` label to narrow the scan. With no label, every bucket is evaluated.

---

## 6. Hebrew glossary / מילון דו-לשוני

| EN | HE |
|----|----|
| Accounts Receivable  | חשבונות חייבים (לקוחות) |
| Accounts Payable     | חשבונות זכאים (ספקים) |
| Aging Report         | דוח גיול |
| Aging Bucket         | דלי גיול |
| Due Date             | תאריך פירעון |
| Issue Date           | תאריך הנפקה |
| Paid Date            | תאריך תשלום |
| Days Overdue         | ימי פיגור |
| Total Outstanding    | סך יתרה פתוחה |
| DSO                  | ימי גבייה ממוצעים |
| DPO                  | ימי תשלום ממוצעים |
| Concentration Risk   | סיכון ריכוזיות |
| Top Delinquents      | חובות גדולים בפיגור |
| Period Variance      | פערים בין תקופות |
| Alert                | התראה |
| Threshold            | סף |
| Currency             | מטבע |
| Customer ID          | מזהה לקוח |
| Vendor ID            | מזהה ספק |
| As-Of Date           | נכון לתאריך |
| Current              | שוטף |
| Past Due             | פיגור |
| Overdue 30+          | פיגור מעל 30 יום |
| Overdue 60+          | פיגור מעל 60 יום |
| Overdue 90+          | פיגור מעל 90 יום |

Full programmatic glossary is exported as `HEBREW_GLOSSARY_V2`.

---

## 7. RTL + bilingual export

**CSV** (`exportCSV`)

- Row 1 — English header: `Customer ID, Total, Count, 0-30, 31-60, 61-90, 91-180, 180+`
- Row 2 — Hebrew header:  `מזהה לקוח, סך יתרה, כמות, 0-30 ימים, …`
- Body   — one row per party, sorted alphabetically by key (deterministic)
- Footer — `TOTAL / סה״כ` row with grand totals

**PDF payload** (`exportPDF`) — structured JSON intended for a downstream renderer. Contains:

- `meta.direction = 'rtl'`
- `meta.title = 'דוח גיול לקוחות / AR Aging'` (or AP equivalent)
- Bilingual `header.en` / `header.he`
- Deterministic `rows[]`
- `summary.byBucket` with bilingual labels

---

## 8. Test results

Command:

```
cd onyx-procurement
node --test test/finance/aging-reports.test.js
```

Result:

```
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 132.39
```

### Test matrix

| # | Scenario | Verifies |
|---|----------|----------|
| 01 | default buckets shape + frozen | 5 buckets, `180+` max=Infinity, immutability |
| 02 | `daysBetween` | pos/neg/zero |
| 03 | `bucketFor` boundaries | 0, 30, 31, 60, 91, 180, 181, 9999, -5 |
| 04 | `arAging` happy path | totals, byBucket, type, typeHe |
| 05 | `arAging` custom buckets | user override works end-to-end |
| 06 | `arAging` paid filter | closed invoice excluded |
| 07 | `apAging` | vendor breakdown + 180+ routing |
| 08 | `dsoCalculation` | (21000 / 100000) * 90 = 18.9 |
| 09 | `dsoCalculation` zero-rev guard | note: 'zero_revenue' |
| 10 | `dpoCalculation` | (12000 / 48000) * 30 = 7.5 |
| 11 | `dpoCalculation` zero-cogs guard | note: 'zero_cogs' |
| 12 | `customerAging` | sorted oldest first, correct totals |
| 13 | `vendorAging` | `vendorId` alias resolves |
| 14 | `topDelinquents` sort | amount desc, excludes not-yet-due |
| 15 | `topDelinquents` limit | respects `limit` arg |
| 16 | `exportCSV` bilingual | both header rows present |
| 17 | `exportCSV` total row | `TOTAL / סה״כ` + grand total |
| 18 | `exportPDF` structure | rtl, bilingual header, summary |
| 19 | `variance` worsened | direction classification |
| 20 | `variance` zero-prior | deltaPct → Infinity safely |
| 21 | `concentrationRisk` shape | grandTotal, top10SharePct = 100, risk high |
| 22 | `concentrationRisk` HHI | concentrated > spread |
| 23 | `alerts` severity | warning + critical + no-trigger cases |
| 24 | `arAging` determinism | identical input ⇒ identical output |
| 25 | house rule | input array is never mutated |
| 26 | `round2` | half-up rounding correctness |
| 27 | `toDate` | normalizes time-of-day to UTC midnight |

---

## 9. Guarantees

- **Zero external dependencies** — only Node built-ins (`node:test`, `node:assert/strict`).
- **Stateless** — no writes, no filesystem, no sockets. Every method is a pure function of its arguments.
- **Deterministic** — verified by test 24; every sort is stable with explicit tie-breakers (`localeCompare`).
- **Append-only semantics** — input arrays are frozen-in-spirit; test 25 snapshots `JSON.stringify` before any call and re-compares after three calls.
- **Hebrew RTL** — every exported payload carries `direction: 'rtl'` and Hebrew labels beside English labels.

---

## 10. Integration notes

- Import path: `require('./src/finance/aging-reports.js')`
- Returned reports are `JSON.stringify`-safe and can flow straight into the dashboard WebSocket, CSV download, or PDF renderer.
- To gradually migrate dashboards off the legacy `aging.js`, run both in parallel and reconcile via the `variance()` function (same interface — pass one report from each engine to diff them).

---

*"לא מוחקים רק משדרגים ומגדלים" — Y-087, Wave 2026.*
