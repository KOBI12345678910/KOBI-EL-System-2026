# QA Agent #49 — Reporting & KPI Analytics
**פרויקט:** onyx-procurement
**תאריך:** 2026-04-11
**סוג בדיקה:** סטטית בלבד (Static analysis)
**מימד:** דיווח, KPIs, חיסכון וניתוחי ביצועים
**קבצים שנבדקו:**
- `server.js` (934 שורות) — endpoints של analytics + חישובי savings
- `web/onyx-dashboard.jsx` (710 שורות) — DashboardTab + KPI cards
- `supabase/migrations/001-supabase-schema.sql` — views ו-functions

---

## 1. מצאי KPIs (KPI Inventory)

### 1.1 מדדים בצד שרת — `procurement_dashboard` view (server 112, sql 478-488)
| # | KPI | מקור | הערה |
|---|-----|------|------|
| 1 | `active_orders` | `COUNT(*) WHERE status NOT IN ('closed','cancelled','delivered')` | חי |
| 2 | `total_orders` | `COUNT(*) purchase_orders` | מצטבר כל הזמנים |
| 3 | `total_spent` | `SUM(total) WHERE status != 'cancelled'` | מצטבר כל הזמנים |
| 4 | `total_savings` | `SUM(negotiated_savings) FROM purchase_orders` | **מצטבר, ללא פילטר תאריך** |
| 5 | `open_rfqs` | `COUNT(*) WHERE status IN ('sent','collecting')` | חי |
| 6 | `pending_approvals` | `COUNT(*) WHERE status='pending_approval'` | חי |
| 7 | `active_suppliers` | `COUNT(*) WHERE active=true` | חי |
| 8 | `quality_passed` | `COUNT(*) WHERE status='delivered' AND quality_result='passed'` | מצטבר |
| 9 | `avg_quality` | `AVG(quality_score)` | ממוצע כל הזמנים |

### 1.2 KPIs בדשבורד (jsx 115-167)
מופיעים 4 כרטיסי KPI בלבד: **ספקים פעילים**, **הזמנות פעילות**, **RFQs פתוחים**, **חיסכון כולל**.

### 1.3 מדדים שנחשבים ב-`/api/analytics/savings` (server 805-823)
- `total_savings` (procurement + subcontractor)
- `procurement.total`, `procurement.decisions`
- `subcontractor.total`, `subcontractor.decisions`

---

## 🟥 R-01 · כל ה-KPIs ללא פילטר תאריך — "חיסכון כולל" חסר מובן עסקי
**חומרה:** 🔴 קריטי — פוגע באמינות הדיווח
**מיקום:**
- `server.js:805-823` — `/api/analytics/savings` סוחף את *כל* הרשומות
- `sql 478-488` — `procurement_dashboard` view מחשב סכומים מצטברים מאז ומעולם
- `jsx:25,38,126` — ה-UI מציג את החיסכון כמספר יחיד ללא context של תקופה

**מה קורה:**
```js
const { data: procurementSavings } = await supabase
  .from('procurement_decisions')
  .select('savings_amount, savings_percent, selected_supplier_name, decided_at');
// ...
const totalProcurement = (procurementSavings || [])
  .reduce((s, d) => s + (d.savings_amount || 0), 0);
```
אין שום `where('decided_at', '>=', ...)`. בעוד שנה-שנתיים הפרונט יצטרך למשוך עשרות אלפי רשומות בכל טעינת דשבורד כדי להציג מספר יחיד שקובי לא יודע אם הוא מינואר או מ-2027.

**המלצה:**
1. להוסיף `?from=2026-01-01&to=2026-12-31` וגם preset ימים (7/30/90/YTD).
2. לצמצם ב-SQL: להוסיף `WHERE decided_at BETWEEN $1 AND $2`.
3. ב-UI: להוסיף תגית תקופה ("חיסכון YTD") כדי שהמשתמש יבין שלא מדובר בחודש הנוכחי.

---

## 2. שיטת חישוב החיסכון — עקביות בין מסלולי ההחלטה

### 2.1 חיסכון ב-RFQ (server 457, 503-504)
```js
const maxPrice = Math.max(...quotes.map(q => q.total_price));
// ...
const savingsAmount = maxPrice - winner.total_price;
const savingsPercent = (savingsAmount / maxPrice) * 100;
```
**המרה:** "ההצעה היקרה ביותר שהתקבלה" (baseline = הצעה הגבוהה ביותר).

### 2.2 חיסכון בקבלני משנה (server 757-760)
```js
const alternativeCost = winner.best_method === 'percentage'
  ? winner.cost_by_sqm
  : winner.cost_by_percentage;
const savingsAmount = alternativeCost - winner.best_cost;
```
**המרה:** ההפרש בין השיטה הנבחרת (%) לבין האלטרנטיבה (₪/מ"ר) *של אותו קבלן*, *לא* מול קבלן אחר.

## 🟥 R-02 · שתי "שפות חיסכון" שונות מצטברות לאותו מספר בדשבורד
**חומרה:** 🔴 קריטי — הטעייה חשבונאית
**מיקום:** `server.js:814-821` (אגרגציה) + `jsx:126,130-144` (הצגה)

**הבעיה:** ה-API מחשב
```
total_savings = totalProcurement + totalSubcontractor
```
אבל:
- **Procurement savings** = max_quote − winner (השוואה בין *מציעים שונים*)
- **Subcontractor savings** = method_A − method_B של *אותו* קבלן (שתי שיטות תמחור חלופיות של אותו אדם)

שני המספרים מדברים על מושגים שונים לחלוטין. חיבור שלהם לא אומר שום דבר עסקי. בנוסף, חישוב ה-procurement (max − winner) מנפח את המספר: אם היו 3 הצעות 100/110/200, ה"חיסכון" יוצא 100 — אבל 200 היא outlier. דיווח אמיתי צריך להשוות ל-**ממוצע** או ל-**חציון**, לא ל-max.

**השוואה לפוטנציאל אמיתי:**
| שיטה | RFQ 100/110/200 | משמעות |
|------|-----------------|--------|
| vs max (הנוכחי) | ₪100 | מנופח |
| vs avg | ₪36.7 | ריאלי |
| vs median | ₪10 | שמרני |
| vs 2nd place | ₪10 | "כמה נחסך ביחס לחלופה הסבירה" |

**המלצה:**
1. להפריד את שני המדדים ב-UI (כרטיסים נפרדים — כבר קיים ב-jsx 130-144, רק צריך להפסיק לחבר ב-KPI הראשי).
2. להוסיף metric "savings vs avg" בצד החישוב הראשי, ולהציג גם את השמרני וגם את המנופח, שהמשתמש יבחר.
3. במסלול ה-subcontractor, להחליף את המונח "חיסכון" ב-"יתרון שיטה" (method advantage) — זה לא חיסכון של ממש, זה בחירה בין שתי דרכי תמחור.

---

## 3. Time bucketing (חלוקה לתקופות)
**ממצא:** **אין בכלל.** לא נמצאה שום `date_trunc`, `GROUP BY extract(month ...)`, חלוקה לשבועות או לרבעונים — לא ב-SQL, לא ב-JS, לא ב-UI.

## 🟥 R-03 · חוסר מוחלט של סדרות זמן
**חומרה:** 🔴 קריטי לדיווח ניהולי
**תוצאה:** אי אפשר לענות על שאלות בסיסיות כמו:
- "איך החיסכון החודש לעומת החודש שעבר?"
- "האם סך ההוצאה בתלת-חודשון עולה או יורד?"
- "כמה RFQs נסגרו בשבוע האחרון?"

**המלצה:** להוסיף endpoint `/api/analytics/timeseries?metric=savings&bucket=month&from=...&to=...` עם:
```sql
SELECT date_trunc('month', decided_at) AS bucket, SUM(savings_amount)
FROM procurement_decisions
WHERE decided_at BETWEEN $1 AND $2
GROUP BY 1 ORDER BY 1;
```

---

## 4. Materialized views vs ad-hoc SQL — ביצועים

**ממצא:**
| View | סוג | בעיה צפויה |
|------|-----|-----------|
| `procurement_dashboard` (sql 478-488) | View רגיל (לא materialized) | 9 sub-selects מלאים *על כל טעינה של `/api/status`* |
| `supplier_dashboard` (sql 456-475) | View רגיל עם 2 LEFT JOINs ו-aggregates | ייקרס כשהספקים וההזמנות יגדלו |
| `rfq_summary` (sql 433-453) | View רגיל עם 3 LEFT JOINs | OK לעכשיו |

## 🟧 R-04 · `procurement_dashboard` הוא שגרה פסיכוטית — 9 תתי-שאילתות בכל פוליקט דשבורד
**חומרה:** 🟧 גבוהה (עתידית)
**מיקום:** `sql 478-488` + `server.js:112` — נקרא בכל קריאת `/api/status`
**מיקום התייחסות:** `jsx:45` — `setInterval(refresh, 30000)` → קריאה *כל 30 שניות*

**מספרים:** `/api/status` גורם ל-9 סריקות טבלה בכל קריאה. ב-30 שנ' = 120 קריאות בשעה = 1080 סריקות. כשטבלת `purchase_orders` תעלה על 5000 שורות, כל status יתחיל לקחת 200-500ms. ברשימת 10 משתמשים בו-זמנית → עומס של 90 סריקות/שנייה על מערכת שלא מדורגת.

**המלצות (דרגתית):**
1. **קצר טווח:** להוסיף אינדקסים ל-`purchase_orders(status, created_at)`.
2. **טווח בינוני:** להפוך את `procurement_dashboard` ל-`MATERIALIZED VIEW` עם `REFRESH MATERIALIZED VIEW CONCURRENTLY procurement_dashboard` כל 5 דקות (cron job ב-Supabase Edge Function).
3. **חלופה:** להעביר את ה-polling של 30 שנ' ל-SSE/Realtime subscription ולהפסיק לסרוק את הטבלאות ב-polling.

## 🟨 R-05 · `/api/analytics/spend-by-category` מבצע full scan ואגרגציה ב-JS
**חומרה:** 🟨 בינונית
**מיקום:** `server.js:834-845`
```js
const { data } = await supabase.from('po_line_items').select('category, total_price');
// ואז:
(data || []).forEach(item => {
  byCategory[item.category] = (byCategory[item.category] || 0) + item.total_price;
});
```
**הבעיה:** מושך *כל* שורות ה-po_line_items — בלי הגבלת תאריך, בלי הגבלת סטטוס (כולל 'cancelled'). ב-10,000 שורות = כל-קריאה ~1MB רשת. זה עבודה שה-DB צריך לעשות ב-`GROUP BY`, לא ה-Node.

**המלצה:** להחליף ב-Supabase RPC / postgres function:
```sql
CREATE OR REPLACE FUNCTION spend_by_category(p_from DATE, p_to DATE)
RETURNS TABLE(category TEXT, total NUMERIC) AS $$
  SELECT li.category, SUM(li.total_price)
  FROM po_line_items li JOIN purchase_orders po ON li.po_id = po.id
  WHERE po.status != 'cancelled'
    AND po.created_at BETWEEN p_from AND p_to
  GROUP BY li.category ORDER BY 2 DESC;
$$ LANGUAGE sql STABLE;
```

---

## 5. Date range picker — UX

## 🟥 R-06 · אין בוחר תאריכים בדשבורד בכלל
**חומרה:** 🔴 קריטי לשימוש ניהולי
**מיקום:** `jsx:115-167` — `DashboardTab` מציג את *כל* ה-savings מאז ומעולם ללא אפשרות לפלטר.
**תוצאה:** קובי/מנהל חייב להתייחס לנתונים כ"מאז ומעולם". אם יחפץ לראות חיסכון של חודש נבחר — *אין* לו דרך.

**המלצה:**
- להוסיף קומפוננטת `<DateRangePicker from to />` בראש ה-DashboardTab
- לשמור את הבחירה ב-state + להעביר ל-`api("/api/analytics/savings?from=..&to=..")`
- preset buttons: "היום", "7 ימים", "30 ימים", "רבעון", "שנה"

---

## 6. Export ל-Excel/CSV

## 🟥 R-07 · אפס יכולת ייצוא
**חומרה:** 🔴 קריטי עסקית (לרו"ח/מס/ניהול)
**ממצא:** לא מצאתי שום שימוש ב-`xlsx`, `json2csv`, `csv-stringify`, אף לא `Blob` + `download` ב-client. אין `Content-Type: text/csv` בתגובות השרת. אין תלויות אלה ב-`package.json`.

**השלכה:** כדי שקובי יזין נתונים לראיית חשבון / שיתוף עם מנהל — הוא יצטרך לסרק, לצלם מסך, או להפיק את הנתונים ידנית. בתרחיש ביקורת (שומה מטעם מע"מ) — אין דרך להפיק fidelity evidence.

**המלצה (שלבי):**
1. Endpoint `/api/analytics/savings.csv` שמחזיר:
   ```
   Content-Type: text/csv; charset=utf-8
   Content-Disposition: attachment; filename=savings-YYYY-MM-DD.csv
   BOM UTF-8 כדי ש-Excel הישראלי יקרא עברית נכון
   ```
2. ייצוא Excel בצד הלקוח עם ספריית `xlsx` (~400KB, מקובל).
3. להוסיף כפתור "📥 הורד CSV" ב-DashboardTab.

---

## 7. Drill-down מ-KPI להזמנות בסיס

## 🟥 R-08 · אין דרך להגיע מ-"חיסכון ₪X" לרשימת ההחלטות
**חומרה:** 🔴 גבוהה — חוסר shemot נתונים (data lineage)
**מיקום:** `jsx:126,131-145`
**תוצאה:** בלחיצה על כרטיס "חיסכון כולל" — *לא קורה כלום*. אין `onClick`, אין ניווט, אין modal, אין trace של איזה RFQs תרמו. אותו דבר עם "ספקים פעילים" ו-"הזמנות פעילות".

**המלצה:**
- Click-through על כל KPI שמוביל ל-view מסונן של הטבלה הבסיסית.
- למשל לחיצה על "חיסכון כולל" → מעבר לטאב חדש "Decisions" המציג את כל ה-`procurement_decisions` עם `savings_amount` מרל+מיון.

---

## 8. דירוג ספקים (Top-supplier rankings)

**מה קיים:** `/api/analytics/spend-by-supplier` (server 825-832) — מחזיר רשימה ממוינת לפי `total_spent` יורד.

## 🟨 R-09 · ה-endpoint קיים, אבל לא נקרא מהדשבורד
**חומרה:** 🟨 בינונית — ה-API בזבוז ללא שימוש
**מיקום:** `jsx:36-41` — בקריאה המקבילה `refresh()` אין `api("/api/analytics/spend-by-supplier")`.
**תוצאה:** קוד חי אבל לא מוצג.

**המלצה:**
1. להוסיף שימוש ב-DashboardTab — לדוגמה bar chart "Top-5 ספקים לפי הוצאה".
2. לבקש מה-endpoint להחזיר גם "`top-savings-contributor`" (ספק שתרם הכי הרבה לחיסכון מצטבר).

## 🟨 R-10 · אין חישוב "spend concentration" / Herfindahl index
**חומרה:** 🟨 בינונית (risk management)
**השלכה:** אם ספק אחד לוקח 80% מההוצאה, זה סיכון עסקי (שער משא ומתן, תלות). המערכת לא מחשבת את זה.

---

## 9. שיעור אספקה בזמן (On-time delivery rate)

**מה קיים:**
- עמודה `on_time_delivery_rate` ב-`suppliers` (sql:29) — `NUMERIC DEFAULT 100`
- עמודה `expected_delivery` וגם `actual_delivery` ב-`purchase_orders` (sql:203,222)

## 🟥 R-11 · `on_time_delivery_rate` לעולם לא מתעדכן — דגל קפוא בטבלה
**חומרה:** 🔴 קריטי — KPI מטעה
**ממצא:**
- לא קיים trigger/function/cron שמעדכן את `on_time_delivery_rate` לאחר שינוי `actual_delivery`
- בשום מקום ב-`server.js` אין `UPDATE suppliers SET on_time_delivery_rate = ...`
- העמודה `actual_delivery` לא נכתבת בשום endpoint קיים — אין UI לסמן "התקבל/מאחר/בזמן"
- הפונקציה `calculate_supplier_score` (sql 410-430) **משתמשת** ב-`on_time_delivery_rate` כקלט → כלומר מחשבת ציון ספקים על סמך ערכים שלא מתעדכנים מעולם (תמיד 100 ברירת-מחדל).

**תוצאה:** כל הציונים של הספקים בדיווחים מבוססים על נתון דמה.

**המלצה:**
1. להוסיף `POST /api/purchase-orders/:id/receive` עם `actual_delivery`.
2. לאחר כל update, להריץ פונקציה שמחשבת:
```sql
UPDATE suppliers SET on_time_delivery_rate = (
  SELECT 100.0 * COUNT(*) FILTER (WHERE actual_delivery <= expected_delivery) / NULLIF(COUNT(*),0)
  FROM purchase_orders
  WHERE supplier_id = suppliers.id AND actual_delivery IS NOT NULL
);
```
3. ב-view `procurement_dashboard`: להוסיף `on_time_rate` לרשימה — כרגע לא מופיע שם ולא בדשבורד.

---

## 10. שיעור ליקויים (Defect rate)

**מה קיים:**
- `quality_result` ב-purchase_orders (sql:218) — `passed|failed|partial`
- `quality_passed` מוגש ב-`procurement_dashboard` (sql:487)

## 🟧 R-12 · defect rate לא נחשב — רק ה-"passed" נספר
**חומרה:** 🟧 גבוהה
**מיקום:** `sql 487-488`
```sql
(SELECT COUNT(*) FROM purchase_orders WHERE status = 'delivered' AND quality_result = 'passed') AS quality_passed
```
אין חישוב `defect_rate = failed / total_inspected`, אין יחס, אין מגמה.

**המלצה:**
```sql
-- להוסיף ל-view:
(SELECT 100.0 * COUNT(*) FILTER (WHERE quality_result = 'failed')
   / NULLIF(COUNT(*) FILTER (WHERE quality_result IS NOT NULL), 0)
 FROM purchase_orders) AS defect_rate_pct
```
+ כרטיס KPI "שיעור ליקויים %" עם חץ מגמה (↑ / ↓ מול חודש קודם).

## 🟥 R-13 · `complaints` בקבלנים לא מתעדכן אוטומטית
**חומרה:** 🔴 גבוהה
**מיקום:** `sql:290` — עמודה `complaints INTEGER DEFAULT 0` ב-subcontractors.
**ממצא:** אין endpoint `/api/subcontractors/:id/complaint` שמעלה את המספר ב-1. אין טבלת `complaints` נפרדת. העמודה קיימת אבל לא מחייה.

---

## 11. עלות לכל פרויקט / ערך פרויקט

**מה קיים:** `project_id`, `project_name` ב-purchase_orders (sql:208-209), וגם בטבלת `subcontractor_decisions` (sql:317-318) — `project_value`, `project_name`, `client_name`.

## 🟥 R-14 · אין endpoint "דוח פרויקט" — למרות שהנתונים קיימים
**חומרה:** 🔴 קריטי עסקית (ROI לפי פרויקט)
**ממצא:** קיים אינדקס `idx_po_project` (sql:233) שמצביע בבירור על כוונה להסתכל לפי פרויקט, אבל:
- אין `/api/analytics/project/:id`
- אין חישוב margin לפי פרויקט (subcontractor_decisions יש `grossMargin` — אבל רק בתגובה מיידית של ה-decide, לא מאוחסן)
- ה-view `procurement_dashboard` לא מקובץ לפי project_id

**תוצאה:** קובי לא יכול לענות על "כמה הוצאתי בפרויקט הלב חולים דנה נהריה?" או "מה הרווח הגולמי של פרויקט ההוא ביחס להוצאת הרכש?"

**המלצה:**
```sql
CREATE OR REPLACE VIEW project_summary AS
SELECT
  COALESCE(po.project_id, sd.project_id) AS project_id,
  COALESCE(po.project_name, sd.project_name) AS project_name,
  SUM(po.total) AS total_procurement,
  SUM(sd.selected_cost) AS total_subcontractor,
  SUM(sd.project_value) AS project_revenue,
  SUM(po.negotiated_savings + sd.savings_amount) AS total_savings
FROM purchase_orders po
FULL OUTER JOIN subcontractor_decisions sd USING (project_id)
GROUP BY 1, 2;
```

---

## 12. Forecasting

**ממצא:** **אפס.** אין שום חישוב prediction, trend projection, moving average או seasonal forecasting. הצהרת הרשומה מוסכמת, זה לא BLOCKER לגרסה 1.0. דורש הערה לבחינה עתידית.

---

## 13. Trend visualization (גרפים)

## 🟥 R-15 · אין ספריית charts בכלל
**חומרה:** 🔴 קריטי לדיווח ניהולי
**ממצא:**
- `package.json` (נבדק בעקיפין — לא ראיתי `recharts`, `chart.js`, `d3`, `victory`)
- `onyx-dashboard.jsx` משתמש ב-inline styles בלבד — אין import של שום charting library
- אין `<canvas>`, אין `<svg>` ידני, אין גרף אחד יחיד לאורך 710 שורות JSX

**תוצאה:** ה-"דשבורד" הוא בפועל 4 מספרים בסך הכל. אפס ויזואליזציה של trend/distribution/composition.

**המלצה:**
- להוסיף `recharts` (~50KB gzipped, תואם React, שפה עברית-RTL דורשת הגדרת `dir='rtl'` ב-wrapper)
- kick-off עם 3 גרפים: line chart (savings לאורך זמן), bar chart (Top suppliers), pie chart (spend לפי קטגוריה)

---

## 14. Real-time vs cached reporting

**ממצא:**
- אין caching layer (אין Redis, אין `cache-control` headers, אין memoization)
- אין `MATERIALIZED VIEW`
- יש polling של 30 שנ' (`jsx:45`)
- כל קריאת דשבורד = שאילתות לייב לכל הטבלאות

## 🟧 R-16 · polling כל 30 שנ' + views לא מקושים = עומס קבוע מיותר
**חומרה:** 🟧 בינונית (ייגדל עם הנתונים)
**המלצה:**
- להגדיר `Cache-Control: private, max-age=30` על `/api/analytics/*`
- להשתמש ב-SWR pattern בצד React, לא polling גולמי
- להפוך את `procurement_dashboard` ל-materialized עם refresh כל 60 שנ'

---

## 15. דיוק נתונים — האם מדדים מחושבים מתעדכנים?

**נבחן שלושה מדדים שמאוחסנים במקום להיות מחושבים:**

### (1) `suppliers.total_orders` / `total_spent`
**כן, מתעדכן** (server 576-580) — אחרי `decide`.
**אבל:** *רק* במסלול RFQ. אם נוצר PO ידנית (`source='manual'`), אין עדכון. גם לא יורד אם PO מתבטל.

### (2) `suppliers.overall_score`
**נכתב רק על-ידי `calculate_supplier_score`** (sql 410-430). הפונקציה קיימת **אבל לא נקראת משום מקום ב-server.js**.

## 🟥 R-17 · `calculate_supplier_score` היא קוד מת
**חומרה:** 🔴 גבוהה — דיווח אי-דיוק
**מיקום:** `sql:410-430`, ללא קריאה ב-server.js
**תוצאה:** `overall_score` מוצג ב-`supplier_dashboard` אבל הערך הוא תמיד ברירת המחדל 70 שנקבעה ב-insert. ה-UI מסדר ספקים לפי ציון מזויף.

**המלצה:**
1. לקרוא לפונקציה במסגרת trigger לאחר UPDATE של `quality_score`, `on_time_delivery_rate`, `risk_score`.
2. לחלופין: להפוך את `overall_score` ל-GENERATED COLUMN או ל-VIEW מחושב.

### (3) `total_negotiated_savings` ב-suppliers (sql:30)
**לא מתעדכן מעולם.** אין `UPDATE suppliers SET total_negotiated_savings = ...` בקוד. העמודה קיימת, בלתי-מעודכנת.

---

## 16. Historic snapshot / "as-of date"

## 🟧 R-18 · אין תמיכה ב-"תמונת מצב לתאריך"
**חומרה:** 🟧 גבוהה (דרישה ביקורתית)
**ממצא:**
- אין `history` tables, אין `period` / `valid_from`/`valid_to` עמודות
- `audit_log` קיים (sql:338-348) אבל שמור רק עם `previous_value` ו-`new_value` JSONB — לא מאופשר שחזור עקבי של מצב הטבלה ל-"איך נראה הדשבורד ב-01/01/2026"
- כל ה-views מבוססים על המצב הנוכחי של הטבלאות

**השלכה:**
- תיקון רטרואקטיבי (למשל ספק שמתברר כהיה לא-פעיל ב-2026-02): משנה נתוני עבר.
- אי אפשר לענות "מה היה total_spent נכון ל-31/03/2026?"

**המלצה (long-term):**
- להוסיף `orders_snapshot` חודשי
- או לעבור ל-PostgreSQL temporal tables (`CREATE TABLE ... WITH SYSTEM VERSIONING` — דורש extension)
- לפחות להקפיא את ה-`decided_at` / `approved_at` כאמת, ולבנות דיווחים מהם

---

## 📊 סיכום חומרה (Reporting Dimension)

| חומרה | מספר ממצאים | Ref IDs |
|------|-------------|---------|
| 🔴 קריטי | 10 | R-01, R-02, R-03, R-06, R-07, R-08, R-11, R-13, R-14, R-15, R-17 |
| 🟧 גבוה | 4 | R-04, R-12, R-16, R-18 |
| 🟨 בינוני | 3 | R-05, R-09, R-10 |
| 🟢 נמוך | 0 | — |
| **סה"כ** | **17** | |

## 🎯 שורה תחתונה — שלוש המלצות דחופות
1. **להוסיף date range filtering לכל endpoint analytics** (R-01, R-03, R-06). ללא זה המערכת לא שמישה לדיווח ניהולי.
2. **לנתק את two-languages savings aggregation** (R-02) — להציג RFQ savings וקבלני-משנה "method advantage" כמדדים נפרדים, עם מתודולוגיה ברורה בטקסט.
3. **לגרום ל-`calculate_supplier_score` ול-`on_time_delivery_rate` לחיות** (R-11, R-17) — אחרת כל ציוני הספקים והדשבורדים מבוססים על 70/100 ברירת מחדל.

---

**Agent 49 — Reporting & KPI Analytics**
**End of static analysis report.**
