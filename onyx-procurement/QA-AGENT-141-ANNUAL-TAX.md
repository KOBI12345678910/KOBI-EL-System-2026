# QA-AGENT-141 — דוח שנתי (Annual Tax Report)

**Project:** onyx-procurement
**Agent:** QA #141
**Mode:** Static audit (Hebrew)
**Dimension:** דוח שנתי — Annual Tax Report / רואה חשבון
**Scope:** `supabase/migrations/001-supabase-schema.sql` + `server.js`
**Date:** 2026-04-11
**Verdict:** FAIL — המערכת אינה כוללת מודול דוח שנתי. נדרשת השלמה מהותית לפני שנת מס סגורה.

---

## 1. רקע

דוח שנתי למס הכנסה בישראל (לחברת בע"מ — "טכנו כל עוזי בע"מ" כפי שמופיע ב-`server.js:657`) מחייב:

- **טופס 1301** — דוח שנתי לעצמאי / יחיד / שותפות
- **טופס 1320** — נספח רווח והפסד עסקי
- **טופס 6111** — דוח התאמה לצרכי מס (חברות)
- **נספח רווח הפסד** (P&L) פר תקופה
- **רווחיות פר פרויקט** (Profit per Project)
- **קבצי ייצוא לרו"ח** (PDF/Excel/דיווח אחיד 856)
- **רשומות Audit-Ready** — חוק ניהול פנקסי חשבונות (מס הכנסה), תקנות 1973

מערכת `onyx-procurement` היא מערכת רכש (Procurement + Subcontractors). היא מתעדת **הוצאות** (purchase_orders, po_line_items, subcontractor_decisions) אבל **לא מתעדת הכנסות, חשבוניות מס, תשלומים מלקוחות, או רישום הנהלת חשבונות כפול.** מבחינת דוח שנתי — המערכת היא רק חצי מהתמונה.

---

## 2. בדיקות לפי הדרישות

### 2.1 Profit per project (רווח פר פרויקט) — PARTIAL

**נמצא:**
- `purchase_orders.project_id` + `purchase_orders.project_name` (schema שורות 208-209) — תיוג הוצאות לפרויקט.
- `subcontractor_decisions` (schema שורות 314-334) — `project_value`, `selected_cost`, `savings_amount`.
- `server.js:761-762` — חישוב `grossProfit = project_value - winner.best_cost` ו-`grossMargin` לפי קבלן משנה בלבד.
- `server.js:795` — החזרת `gross_profit: { amount, margin }` ב-response של `/api/subcontractors/decide`.

**חסר (קריטי):**
- **אין endpoint** `/api/analytics/profit-by-project` או `/api/projects/:id/profit`.
- החישוב ב-`decide` הוא **"רגע־בזמן"** של בחירת קבלן אחד, לא צבירה של כלל ההוצאות לפרויקט.
- **אין טבלת `projects`** עם `client_price` / `revenue` / `contract_value`. `project_value` ב-`subcontractor_decisions` הוא פרמטר קלט, לא source-of-truth.
- **אין aggregation** של `purchase_orders.total` לפי `project_id` שמקוזז מול ההכנסה. אי אפשר לחשב רווחיות פרויקט סגור.
- `purchase_request_items` אין לו `project_id`, רק `purchase_requests.project_id` (שורה 87) — שרשור עקיף דרך PR→RFQ→PO.

**פסיקה:** חישוב "רווח פר פרויקט" לא קיים במערכת. מה שקיים הוא רווח תאורטי מקבלן משנה יחיד.

---

### 2.2 Annual P&L (רווח והפסד שנתי) — FAIL

**נמצא:**
- `/api/analytics/savings` (server.js:805-823) — סך חסכונות רכש + קבלנים. חסכון ≠ רווח.
- `/api/analytics/spend-by-supplier` (server.js:825-832) — הוצאה פר ספק.
- `/api/analytics/spend-by-category` (server.js:834-845) — הוצאה פר קטגוריה.
- `procurement_dashboard` view (schema שורות 478-488) — `total_spent`, `total_savings`. אין `total_revenue`.

**חסר (קריטי):**
- **אין endpoint** `/api/reports/pnl?year=2025` או `/api/analytics/annual-pnl`.
- **אין טבלאות הכנסות:**
  - אין `invoices` (חשבוניות מס ללקוחות)
  - אין `customer_payments` (תקבולים)
  - אין `clients` / `customers` (נרמז `client_name` כ-TEXT ב-`subcontractor_decisions:318`, אין טבלה)
- **אין שכבת הכרת הכנסה** (Revenue Recognition) — לא ניתן לחשב Gross Profit, Operating Profit, Net Profit.
- **אין הוצאות תפעול שאינן רכש:** שכר עובדים, שכירות, רכב, פחת, מע"מ, ריבית, עמלות. דוח P&L בלי אלה = חסר תוקף חוקי.
- **אין filter by fiscal year** על אף endpoint אנליטי. `/api/analytics/savings` מחזיר מהתחלת הזמן.
- **אין חלוקת תקופות חודש/רבעון/שנה** (monthly/quarterly/YTD).

**פסיקה:** אי אפשר להפיק דוח P&L שנתי מהמערכת. חסרה חצי מהמשוואה החשבונאית (הכנסות).

---

### 2.3 Form 1301/1320 generation — FAIL

**נמצא:**
- כלום. אין שום התייחסות בקוד ל-1301, 1320, 6111, 856, דוח מס הכנסה, שומה.

**חסר (קריטי):**
- אין module `pdf-generator` או `tax-forms`.
- אין template ל-1301 (דוח שנתי יחיד) — דורש: פרטי מגיש, 1240 שדות רווח עסקי, מקורות הכנסה, ניכויים, זיכויים, חישוב מס.
- אין template ל-1320 (נספח רווח והפסד עסקי) — דורש: מחזור, עלות המכר, הוצאות הנהלה, רווח תפעולי, הוצאות/הכנסות מימון, רווח לפני מס.
- אין mapping של נתונים פנימיים → שורות טופס.
- אין תמיכה ב-XML/JSON של שע"מ (שידור ממוחשב) או PDF-417 barcode למילוי אוטומטי.
- אין לוגיקת VAT reconciliation — `purchase_orders.vat_amount` קיים (schema:199) אבל לא מקושר לדוח 874 (דיווח מע"מ).

**פסיקה:** יצירת טפסי מס אינה קיימת. הפער הוא "בנה מאפס".

---

### 2.4 Accountant export (ייצוא לרואה חשבון) — FAIL

**נמצא:**
- ייצוא `/api/audit` (server.js:852-856) — רשימת JSON של audit log. לא בפורמט חשבונאי.
- אין endpoint ייצוא.

**חסר (קריטי):**
- **אין קובץ BKMVDATA.TXT** (דיווח אחיד — תקנות מס הכנסה (ניהול פנקסי חשבונות), 1973, סעיף 36). זהו המפתח לחשבון כל חברת בע"מ ישראלית. פורמט טקסט קבוע עם:
  - `C100` — חשבוניות מכר
  - `D110` — חשבוניות רכש
  - `B100` — תנועות יומן
  - `B110` — כרטסת חשבונות
  - `M100` — רשומות מלאי
- **אין ייצוא Excel/CSV** של purchase_orders + subcontractor_decisions פר שנה.
- **אין ייצוא PDF** מרוכז של הזמנות רכש כמסמכי רקע לביקורת.
- **אין endpoint** `/api/export/accountant?year=2025&format=bkmv`.
- אין חיבור לתוכנות הנה"ח ישראליות (חשבשבת, רמי, פריוריטי, ריווחית, חילן).

**פסיקה:** ייצוא לרו"ח לא קיים. זו דרישה רגולטורית (תקנות 36+36א).

---

### 2.5 Audit-ready records (רשומות מוכנות לביקורת) — PARTIAL

**נמצא (חיובי):**
- `audit_log` table (schema:338-351) — entity_type, entity_id, action, actor, detail, previous_value, new_value, created_at. מובנה היטב.
- `server.js:99-108` + קריאות ל-`audit()` ב-11 מקומות (שורות 152, 161, 209, 326, 412, 582, 621, 672).
- Indexes על `(entity_type, entity_id)` ו-`created_at DESC` — ביצועי שאילתה טובים.
- `system_events` (schema:355-367) — אירועי מערכת מתועדים.
- `procurement_decisions.reasoning` JSONB + `subcontractor_decisions.reasoning` JSONB — תיעוד החלטות AI לביקורת.
- `purchase_orders.approved_by` + `approved_at` — trail של אישורים.

**חסר (מהותי):**
- **אין Immutability** על `audit_log`. אין `ALTER TABLE audit_log ... INSERT-ONLY` או trigger חסימת UPDATE/DELETE. חוק ניהול פנקסים דורש רשומה שלא ניתן לשנות (WORM).
- **אין Hash Chain / Digital Signature** על רשומות — אין הגנה מפני שינוי רטרואקטיבי. תקנות ניהול פנקסים ממוחשבים דורשות "אמצעי אבטחה" למניעת שינוי (תקנה 36(ב)(1)).
- **אין שמירה ל-7 שנים** (חובת שמירה לפי סעיף 25 לפקודת מס הכנסה) — אין policy או retention mechanism.
- **אין Foreign Key** בין `audit_log.entity_id` לטבלאות המקור — רשומות מחיקה (ON DELETE CASCADE) ינתקו את ה-audit מהישות.
- **אין snapshot חודשי** (Point-in-Time) של הרשומות הכספיות.
- **אין לוג של קריאות (read)** — רק mutations. לרגולטור הישראלי (הגנת הפרטיות) ולביקורת, קריאות לנתונים רגישים חייבות להיות מתועדות.
- `audit_log.actor` הוא TEXT חופשי (server.js:152 — `req.body.created_by || 'api'`) — אין אימות מי באמת ביצע את הפעולה. לא aligned עם user sessions.
- `supabase_anon_key` (server.js:25) — המפתח הציבורי של Supabase ב-backend, כלומר אין RLS אמיתי בעורף, בדיקה מתבצעת ב-application-layer בלבד. הערה: RLS מופיע ב-schema:490-493 רק כ-comment.

**פסיקה:** התשתית ל-audit trail קיימת וטובה. חסרה הקשחה (immutability, integrity, retention) כדי שתהיה "audit-ready" במובן הרגולטורי.

---

## 3. סיכום פערים (Gap Analysis)

| # | דרישה | סטטוס | חומרה | עלות תיקון |
|---|-------|-------|-------|-----------|
| 1 | Profit per project | PARTIAL | HIGH | גבוהה — טבלת projects + revenue + aggregation |
| 2 | Annual P&L | FAIL | CRITICAL | קריטית — חסר כל צד ההכנסות |
| 3 | Form 1301/1320 | FAIL | CRITICAL | גבוהה מאוד — מודול טפסים |
| 4 | Accountant export | FAIL | CRITICAL | רגולטורית — BKMVDATA חובה |
| 5 | Audit-ready | PARTIAL | MEDIUM | בינונית — הקשחה של קיים |

---

## 4. בעיות מצטברות מהותיות

1. **המערכת היא "חצי ERP"** — רכש בלבד. דוח שנתי חייב לכסות הכנסות, הוצאות שאינן רכש (שכר, שכירות), נכסים קבועים (פחת), מע"מ, ניכוי מס במקור, הלוואות. אף אחד מאלה לא קיים.
2. **אין fiscal year awareness** — כל ה-`created_at TIMESTAMPTZ` אבל אין `fiscal_year`, אין סגירת שנה, אין locking לתקופות סגורות. רו"ח יוכל לערוך נתונים של 2024 אחרי שכבר הוגש דוח.
3. **אין currency locking** — `currency TEXT DEFAULT 'ILS'` בכל מקום, אבל אין שער המרה ליום, אין `NUMERIC(14,2)` (השדות `NUMERIC` ללא דיוק קבוע — סכנת עיגולים לחישובי מס, סתירה עם QA-AGENT-38 MONEY-PRECISION).
4. **VAT handling חלקי** — `purchase_orders.vat_amount` נשמר כשדה נפרד, אבל אין `vat_rate` (17%? 0%? פטור?), אין `vat_period`, אין הבחנה בין VAT-In ל-VAT-Out (אין VAT-Out כי אין חשבוניות). לא ניתן להפיק דוח 874.
5. **אין הפרדה תושב/חברה** — טופס 1301 הוא לעצמאי/יחיד. חברה מגישה 1214 + 6111. הקוד מזכיר "טכנו כל עוזי בע"מ" (server.js:657) — משמע חברה — אז הטופס המבוקש (1301) אולי לא הטופס הנכון. מומלץ לוודא מול רו"ח.

---

## 5. המלצות פעולה (Actionable)

### עדיפות CRITICAL (חובה לפני דוח שנתי):

1. **להוסיף טבלת `revenue_transactions`** עם: `id`, `project_id`, `client_name`, `invoice_number`, `amount`, `vat_amount`, `invoice_date`, `payment_status`, `fiscal_year`.
2. **להוסיף טבלת `projects`** עם: `id`, `name`, `client_id`, `contract_value`, `start_date`, `end_date`, `status`, `fiscal_year`.
3. **להוסיף טבלת `expense_categories`** (payroll, rent, depreciation, finance) שאינן purchase_orders.
4. **ליישם endpoint** `POST /api/reports/annual-pnl` שמחזיר: revenue, COGS (purchase_orders + subcontractors), gross profit, operating expenses, operating profit, net profit — הכל מפולח לפי `fiscal_year`.
5. **ליישם ייצוא BKMVDATA.TXT** לפי מפרט רשות המסים (מסמך "מבנה אחיד לקובץ נתונים").
6. **להוסיף immutability ל-audit_log**: REVOKE UPDATE, DELETE מכל role; trigger BEFORE UPDATE/DELETE → RAISE EXCEPTION.
7. **לאכוף `NUMERIC(14,2)`** על כל שדה כספי במיגרציה חדשה.

### עדיפות HIGH:

8. **ליישם endpoint** `GET /api/projects/:id/profit-loss` — צבירת כל ההוצאות (PO + subcontractor) מול ההכנסות לפרויקט.
9. **ליישם `fiscal_year_closed`** table + RLS חסימה של שינויים לתקופה סגורה.
10. **ליישם hash chain** על `audit_log`: `hash = SHA256(prev_hash || current_row)`, בדיקה בקריאה.
11. **יצירת PDF 1301/1320**: `pdfkit` או `puppeteer` עם template רשמי. ניתן להתחיל ממילוי ידני של השדות.

### עדיפות MEDIUM:

12. **ייצוא Excel** (`exceljs`) חודשי של כל התנועות.
13. **חיבור ישיר ל-API חשבשבת/פריוריטי** (אם הלקוח משתמש).
14. **logging של reads** לטבלאות רגישות (notifications, suppliers with PII).

---

## 6. Test cases שהיו אמורים לעבור ונכשלו

| # | תסריט | תוצאה צפויה | תוצאה בפועל |
|---|-------|-------------|-------------|
| T1 | `GET /api/reports/annual-pnl?year=2025` | JSON עם revenue, COGS, gross profit, net profit | 404 — endpoint לא קיים |
| T2 | `GET /api/projects/PRJ-001/profit` | רווח פרויקט מחושב | 404 |
| T3 | `POST /api/reports/form-1301?year=2025` | PDF טופס 1301 | 404 |
| T4 | `GET /api/export/bkmv?year=2025` | BKMVDATA.TXT תקני | 404 |
| T5 | `DELETE FROM audit_log WHERE id='...'` | שגיאה (immutable) | מחיקה מותרת |
| T6 | `UPDATE audit_log SET actor='...'` | שגיאה | UPDATE מותר |
| T7 | `SELECT SUM(total) FROM purchase_orders WHERE EXTRACT(year FROM created_at)=2025` | עובד | עובד (אבל אין endpoint שמשתמש) |
| T8 | `SELECT SUM(revenue) FROM invoices WHERE year=2025` | סכום הכנסות | שגיאה — הטבלה לא קיימת |
| T9 | הורדת קובץ "דיווח שנתי לרואה חשבון" מה-UI | ZIP עם BKMV + PDF + Excel | UI לא קיים |
| T10 | ייצור דוח 856 (דיווח אחיד) | קובץ תקני | לא קיים |

**תוצאה: 9/10 נכשלים. 1/10 עובד חלקית כשאילתה ידנית על ה-DB.**

---

## 7. תאימות רגולטורית

| חוק/תקנה | דרישה | מצב |
|----------|-------|-----|
| פקודת מס הכנסה, סעיף 130 | הגשת דוח שנתי | לא נתמך |
| פקודת מס הכנסה, סעיף 25 | שמירת ספרים 7 שנים | אין policy |
| תקנות מס הכנסה (ניהול פנקסי חשבונות), תקנה 36 | BKMVDATA | לא נתמך |
| חוק מע"מ, סעיף 69 | דיווח 874 | לא נתמך |
| חוק הגנת הפרטיות, תקנות אבטחת מידע 2017 | logging קריאות | לא נתמך |
| חוק החברות, סעיף 171 | דוחות כספיים שנתיים | לא נתמך |

**הערכה:** אם המערכת תשמש בפועל כמקור אמת לדוח שנתי — יש חשיפה רגולטורית ממשית. כיום היא משמשת רק למעקב רכש, ודוח שנתי מופק במערכת אחרת (כנראה חשבשבת / פריוריטי). **לוודא עם הלקוח שאינו מסתמך על onyx לצורך דיווח למס הכנסה.**

---

## 8. מסקנה סופית

**Verdict: FAIL (מחייב לפני שנת מס סגורה)**

מערכת `onyx-procurement` במצבה הנוכחי אינה מוכנה לשמש כמקור אמת לדוח שנתי למס הכנסה. הפער הוא מבני — חסר צד ההכנסות לחלוטין, חסר מודול טפסים, חסר ייצוא רגולטורי, חסר הקשחה של audit log. התשתית קיימת למעקב רכש בלבד.

**מינימום ליציאה ל-production עם דוח שנתי:** יישום סעיפים 1-7 ברשימת ההמלצות (עלות מוערכת: 3-5 שבועות פיתוח, כולל בדיקות מול רו"ח בפועל).

**Interim recommendation:** עד שהמודול ייבנה — רו"ח של החברה חייב לקבל גישה ישירה ל-Supabase (read-only) + ייצוא CSV ידני של `purchase_orders` + `subcontractor_decisions` פעם בחודש, ולהזין ידנית למערכת הנהלת חשבונות הראשית (חשבשבת/פריוריטי). זה **לא** BKMVDATA תקני, אבל נותן נראות עד לתיקון.

---

**QA Agent:** #141
**Static. Hebrew. Dimension: Annual Tax Report.**
**End of report.**
