# QA-AGENT-143 — ניהול הוצאות וקופה קטנה (Expense Management / Petty Cash)

**סוכן:** QA Agent #143
**תאריך:** 2026-04-11
**מימד:** Expense Management / Petty Cash
**סוג בדיקה:** Static (ניתוח סטטי בלבד)
**שפה:** עברית / RTL
**היקף סקירה:** `supabase/migrations/001-supabase-schema.sql` (563 שורות, 18 טבלאות), `server.js` (934 שורות, 28 endpoints)
**קישור-צולב:** QA-AGENT-47-FILE-UPLOAD.md (ראייה לכך שלמערכת אין צינור העלאת קבצים כלל)

---

## TL;DR — הממצא המרכזי

**המערכת כיום אינה כוללת כל תשתית של ניהול הוצאות, קופה קטנה, החזרי הוצאות, או מעקב נסיעות.** כל ששת הדרישות של QA-143 — טבלת הוצאות, העלאת תמונת קבלה, תיוג קטגוריה, הקצאה לפרויקט, workflow להחזר, מעקב קילומטראז' — **אינן קיימות כלל**, לא במסד הנתונים, לא ב-API, ולא ב-seed data.

זהו פער מוצר עצום עבור "מערכת רכש מקצה לקצה": ספקים (suppliers), הזמנות (purchase_orders), RFQs וקבלני משנה (subcontractors) מכוסים, אך **הצד השני של התזרים** — הוצאות עובדים במזומן, החזרים, נסיעות באוטו פרטי, קבלות סופרמרקט/פנצ'ר/דלק — **לא קיים**. בפועל, בחברת ייצור בפועל, הוצאות "פנים-ארגוניות" הן 5%-15% מתזרים הרכש החודשי, וזה המקום שבו המערכת הנוכחית "דולפת".

**חומרת-על:** **P1 גבוהה (פיצ'ר חסר קריטי)** — אין פגיעת אבטחה פעילה, אך אין תשלום/החזר/מעקב.

---

## 1. הראיות הקשות מהניתוח הסטטי

### 1.1 `001-supabase-schema.sql` — חיפוש מחרוזות

בוצע grep בקובץ הסכמה עבור כל המחרוזות הבאות (case-insensitive, עברית + אנגלית):
```
expense | petty | cash | receipt | reimburs | mileage | voucher | employee_advance
הוצא   | קופה  | קבלה  | החזר    | נסיעה   | קילומטר | מפרעה
```

**תוצאה: 0 התאמות.**

אף אחת מ-18 הטבלאות הקיימות אינה טבלת הוצאות:
1. `suppliers` — ספקים
2. `supplier_products` — מוצרי ספקים
3. `price_history` — היסטוריית מחירים
4. `purchase_requests` — בקשות רכש (רמת ארגון, לא עובד בודד)
5. `purchase_request_items` — פריטי בקשת רכש
6. `rfqs` — בקשות להצעת מחיר
7. `rfq_recipients` — נמעני RFQ
8. `supplier_quotes` — הצעות מחיר
9. `quote_line_items` — שורות הצעה
10. `purchase_orders` — הזמנות רכש
11. `po_line_items` — שורות הזמנה
12. `procurement_decisions` — החלטות רכש
13. `subcontractors` — קבלני משנה
14. `subcontractor_pricing` — מחירון קבלנים
15. `subcontractor_decisions` — החלטות קבלנים
16. `audit_log` — לוג פעולות
17. `system_events` — אירועי מערכת
18. `notifications` — התראות

**אין:** `expenses`, `petty_cash_transactions`, `expense_categories`, `expense_reimbursements`, `mileage_log`, `vehicle`, `employee`, `cash_float`, `cash_drawer`, `expense_approvals`, `expense_attachments`, `receipt_photos`.

### 1.2 `server.js` — 28 endpoints, 0 הוצאות

Endpoints שנספרו (grep על `app.(get|post|put|delete|patch)`):

- `/api/status`
- `/api/suppliers` (GET, GET/:id, POST, PATCH/:id)
- `/api/suppliers/:id/products` (POST)
- `/api/suppliers/search/:category` (GET)
- `/api/purchase-requests` (GET, POST)
- `/api/rfq/send`, `/api/rfq/:id`, `/api/rfqs`
- `/api/quotes` (POST)
- `/api/rfq/:id/decide` (POST)
- `/api/purchase-orders` (GET, GET/:id, POST /approve, POST /send)
- `/api/subcontractors` (GET, POST, PUT/:id/pricing, POST /decide)
- `/api/analytics/savings`, `/api/analytics/spend-by-supplier`, `/api/analytics/spend-by-category`
- `/api/audit`
- `/webhook/whatsapp` (GET, POST)

**אין:**
- `POST /api/expenses` (הגשת הוצאה)
- `GET /api/expenses` (רשימת הוצאות עובד)
- `POST /api/expenses/:id/receipt` (העלאת תמונת קבלה)
- `POST /api/expenses/:id/submit` (הגשה לאישור)
- `POST /api/expenses/:id/approve|reject` (workflow)
- `POST /api/expenses/:id/reimburse` (סימון כשולם/החזר)
- `POST /api/mileage` (רישום נסיעה)
- `GET /api/petty-cash/float` (יתרת קופה)
- `POST /api/petty-cash/topup` (חידוש קופה)

### 1.3 `package.json` — חיזוק עקיף

לפי QA-47, ה-`package.json` כולל רק 4 תלויות: `express`, `@supabase/supabase-js`, `dotenv`, `cors`. **אין `multer` / `busboy` / `formidable` / `sharp`** — אין שום דרך להעלות תמונת קבלה כיום, גם אם הייתה טבלה.

---

## 2. ניתוח פער לכל שש נקודות הבדיקה

### 2.1  נקודה 1 — טבלת Expenses

**סטטוס: חסר לחלוטין. P1.**

אין טבלה `expenses`. אין אפילו אזכור של הרעיון ב-18 הטבלאות הקיימות. `purchase_requests` הכי קרוב שיש, אבל הוא מיועד לבקשת רכש ארגונית (supplier-driven) — הוא אינו תומך בעובד שרוכש במזומן ומבקש החזר בדיעבד. הוא חסר שדות קריטיים לאיתור עובד (`employee_id`), תאריך תשלום בפועל (`paid_at`), אמצעי תשלום (`payment_method` = cash/credit_card/ בנק), מטבע ספציפי להוצאה, סכום ששולם בפועל (vs. סכום מבוקש), ולינק לצילום קבלה.

**מה נדרש (schema מוצע לגרסה 002):**

```sql
CREATE TABLE expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_number TEXT UNIQUE NOT NULL,                       -- EXP-2026-0001
  employee_id UUID NOT NULL,                                 -- FK לעובדים (אין כיום טבלה)
  employee_name TEXT NOT NULL,                               -- denormalized
  expense_date DATE NOT NULL,                                -- תאריך ההוצאה (לא ההגשה)
  submitted_at TIMESTAMPTZ,
  description TEXT NOT NULL,
  category_id UUID REFERENCES expense_categories(id),       -- ראה 2.3
  project_id TEXT,                                           -- ראה 2.4
  project_name TEXT,
  vendor_name TEXT,                                          -- שם בית-העסק בקבלה
  vendor_tax_id TEXT,                                        -- ח.פ/ע.מ - לצורכי מס
  amount_gross NUMERIC NOT NULL,                             -- סכום כולל
  vat_amount NUMERIC DEFAULT 0,
  amount_net NUMERIC NOT NULL,
  currency TEXT DEFAULT 'ILS',
  payment_method TEXT CHECK (payment_method IN
    ('cash','petty_cash','personal_credit','company_credit','bank_transfer','other')),
  is_reimbursable BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'draft' CHECK (status IN
    ('draft','submitted','pending_approval','approved','rejected','reimbursed','paid','cancelled')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  reimbursed_at TIMESTAMPTZ,
  reimbursement_method TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_expenses_employee ON expenses(employee_id);
CREATE INDEX idx_expenses_project ON expenses(project_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date DESC);
```

**נקודת כאב נוספת:** אין כלל טבלת `employees`. כך ש-`employee_id` בעצם משמעותו — הרחבה רוחבית של המערכת. כיום `purchase_requests.requested_by` הוא רק TEXT חופשי, לא FK, ולכן אין שום שלמות רפרנציאלית לעובדים.

---

### 2.2  נקודה 2 — העלאת תמונת קבלה (Receipt Photo Upload)

**סטטוס: חסר לחלוטין. P0 בהיבט ביקורת (audit).** קישור-צולב: **QA-47**.

אין שום:
- אזור אחסון (Supabase Storage bucket `expense-receipts`)
- endpoint `POST /api/expenses/:id/receipt`
- middleware להעלאה (multer חסר ב-package.json — ראה QA-47 §1.1)
- אימות תוכן (magic-bytes, `file-type`) — QA-47 הדגיש שבכלל אין אימות כזה
- סריקת וירוסים (ClamAV) — QA-47 הדגיש העדר
- יצירת thumbnail / OCR (`sharp` / `tesseract.js`) לחילוץ סכום + תאריך
- בקרת גודל (`LIMIT 5MB`), סוג (`image/jpeg|png|pdf בלבד`), ו-rate limit

**השלכה קונקרטית:** רו"ח לא יכול להוכיח שלהוצאה מצורפת קבלה. מס הכנסה דורש שמירת קבלה 7 שנים. גם אם ה-workflow יאושר ע"י המנהל — **אין ראיה לחשבונית המס מאחוריו**. הוצאה ללא קבלה היא הוצאה שאינה מוכרת לצורכי מס, ואף עלולה להיחשב הלבנת הון במיוחד עבור סכומים מצטברים.

**מה נדרש (schema):**

```sql
CREATE TABLE expense_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,                    -- לדוג: receipts/2026/04/EXP-0001.jpg
  storage_bucket TEXT DEFAULT 'expense-receipts',
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  file_hash_sha256 TEXT NOT NULL,                -- למניעת כפילויות + ביקורת
  ocr_extracted JSONB,                           -- {vendor, amount, vat, date}
  ocr_confidence NUMERIC,
  page_count INTEGER DEFAULT 1,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  virus_scan_status TEXT DEFAULT 'pending'
    CHECK (virus_scan_status IN ('pending','clean','infected','skipped','failed')),
  virus_scan_at TIMESTAMPTZ
);
CREATE INDEX idx_expense_attach_expense ON expense_attachments(expense_id);
CREATE UNIQUE INDEX idx_expense_attach_hash ON expense_attachments(expense_id, file_hash_sha256);
```

**הפניות-צולבות חובה:** כל סעיפי QA-47 (multer, file-type, sharp, ClamAV, LIMIT, rate-limit, CSP). לא ניתן להוסיף רק את הטבלה — חייב להוסיף את **כל הצינור** מ-QA-47.

---

### 2.3  נקודה 3 — תיוג קטגוריה (Category Tagging)

**סטטוס: חסר לחלוטין. P2.**

הסכמה הקיימת כן משתמשת ב-`category` במקומות שונים (`supplier_products.category`, `purchase_request_items.category`, `po_line_items.category`), **אך אלה טקסט חופשי ללא טבלת reference**, ולכן מושגים כמו "דלק", "אש"ל", "כיבוד", "לינה", "טלפון", "ציוד משרדי" — אינם קיימים כלל ואינם סטנדרטיים.

אין `expense_categories`, אין הירכייה (דלק → דלק/מונית/חניה), אין קישור ל-Chart-of-Accounts, ואין GL code.

**בעיה נלווית:** `purchase_order_items` ו-`expenses` לא ישתמשו באותה קטגוריזציה ==> דוחות `analytics/spend-by-category` (שקיים כיום) לא יראו את ההוצאות הפנימיות בכלל.

**מה נדרש:**

```sql
CREATE TABLE expense_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                      -- FUEL, MEAL, TRAVEL, OFFICE
  name_he TEXT NOT NULL,
  name_en TEXT,
  parent_id UUID REFERENCES expense_categories(id),
  gl_account TEXT,                                -- קוד חשבון ראשי
  default_vat_rate NUMERIC DEFAULT 17,
  is_reimbursable_default BOOLEAN DEFAULT true,
  requires_receipt BOOLEAN DEFAULT true,
  max_amount_without_receipt NUMERIC DEFAULT 50,  -- עד 50 ש"ח ללא קבלה (מדיניות ברירת מחדל)
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- seed דוגמה:
INSERT INTO expense_categories (code, name_he, gl_account) VALUES
  ('FUEL', 'דלק', '5210'),
  ('TOLL', 'כביש אגרה', '5211'),
  ('PARKING', 'חניה', '5212'),
  ('MEAL', 'אש"ל/אירוח', '5310'),
  ('HOTEL', 'לינה', '5311'),
  ('OFFICE', 'ציוד משרדי', '5410'),
  ('PHONE', 'טלפון/אינטרנט', '5420'),
  ('TAXI', 'מונית/GETT', '5213'),
  ('TRAIN', 'רכבת', '5214'),
  ('TOOLS', 'כלי עבודה קטנים', '5510'),
  ('CLIENT_GIFT', 'מתנות ללקוחות', '5610');
```

---

### 2.4  נקודה 4 — הקצאה לפרויקט (Project Allocation)

**סטטוס: חלקית. P1.**

הסכמה כן מכירה במושג פרויקט במקומות ספציפיים:
- `purchase_requests.project_id`, `purchase_requests.project_name`
- `purchase_orders.project_id`, `purchase_orders.project_name` + אינדקס `idx_po_project`
- `subcontractor_decisions.project_id`, `project_name`, `client_name`

**אבל:**
1. **אין טבלת `projects`** — אלה שדות TEXT חופשיים בלי FK → אין שלמות, אין הצטברות, אין WBS, אין תקציב.
2. **אין split** — הוצאה אחת לא יכולה להתחלק בין כמה פרויקטים (scenario נפוץ: נסיעה לשני אתרי בניה באותו יום → הוצאת דלק צריכה להתחלק 50/50).
3. **אין קישור אחורה** — אין view שמציג "סך ההוצאות בפרויקט X" כולל הוצאות עובדים (רק PO-level).

**מה נדרש:**

```sql
-- מינימום:
CREATE TABLE projects (
  id TEXT PRIMARY KEY,                       -- לדוג: PRJ-2026-042
  name TEXT NOT NULL,
  client_name TEXT,
  status TEXT CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  budget_total NUMERIC,
  budget_materials NUMERIC,
  budget_labor NUMERIC,
  budget_expenses NUMERIC,                   -- תקציב להוצאות פנים-ארגוניות
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- split table (רב-פרויקט בהוצאה אחת):
CREATE TABLE expense_allocations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  allocation_percent NUMERIC NOT NULL CHECK (allocation_percent > 0 AND allocation_percent <= 100),
  amount_allocated NUMERIC NOT NULL,
  notes TEXT
);
-- CHECK: SUM(allocation_percent) PER expense_id = 100

CREATE INDEX idx_expense_alloc_expense ON expense_allocations(expense_id);
CREATE INDEX idx_expense_alloc_project ON expense_allocations(project_id);
```

**+ View מאוחד:**
```sql
CREATE VIEW project_total_spend AS
SELECT
  p.id, p.name,
  COALESCE(SUM(DISTINCT po.total), 0) AS purchase_order_spend,
  COALESCE(SUM(ea.amount_allocated), 0) AS employee_expense_spend,
  COALESCE(SUM(DISTINCT po.total), 0) + COALESCE(SUM(ea.amount_allocated), 0) AS total_spend,
  p.budget_total,
  p.budget_total - (COALESCE(SUM(DISTINCT po.total), 0) + COALESCE(SUM(ea.amount_allocated), 0)) AS budget_remaining
FROM projects p
LEFT JOIN purchase_orders po ON po.project_id = p.id AND po.status != 'cancelled'
LEFT JOIN expense_allocations ea ON ea.project_id = p.id
LEFT JOIN expenses e ON ea.expense_id = e.id AND e.status IN ('approved','reimbursed','paid')
GROUP BY p.id, p.name, p.budget_total;
```

---

### 2.5  נקודה 5 — Workflow החזרי הוצאות (Reimbursement Workflow)

**סטטוס: חסר לחלוטין. P1.**

`purchase_orders` כן כולל state-machine עם 11 מצבים ופונקציית אישור (`/api/purchase-orders/:id/approve`), **אבל זה למסלול הרכש הארגוני, לא לעובד שחוזר מנסיעה עם חבילת קבלות**.

**אין:**
- state-machine ל-`expenses` (draft → submitted → pending_approval → approved/rejected → reimbursed → paid)
- תפקידי מאשר (manager / cfo / owner) לרמות סכום שונות
- סף אישור (auto-approve עד ₪200; manager עד ₪2,000; CFO מעל)
- התראה למאשר (ל-`notifications` קיימת, אבל לא מחוברת)
- מסלול דחייה + תגובת עובד
- יצוא ל-payroll / בנק (ABA / Masav) עבור ההחזר בפועל
- SLA ("כל הוצאה שלא טופלה תוך 7 ימי עסקים — escalate ל-CFO")

**מה נדרש (endpoints):**

```
POST /api/expenses                          — יצירת draft
POST /api/expenses/:id/attachments          — העלאת קבלה (קישור-צולב QA-47)
POST /api/expenses/:id/submit               — draft → submitted
POST /api/expenses/:id/approve              — pending_approval → approved  (דורש role)
POST /api/expenses/:id/reject               — pending_approval → rejected   (דורש reason)
POST /api/expenses/:id/reimburse            — approved → reimbursed         (payroll integration)
GET  /api/expenses                          — list עם filters (employee, project, date, status)
GET  /api/expenses/:id                      — single
GET  /api/expenses/pending-approval         — inbox למאשרים
GET  /api/expenses/analytics/by-category    — דוח לפי קטגוריה
GET  /api/expenses/analytics/by-project     — דוח לפי פרויקט
GET  /api/expenses/export/payroll           — יצוא לקובץ משכורות
```

**תוספת schema נדרשת:**

```sql
CREATE TABLE expense_approval_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  min_amount NUMERIC NOT NULL,
  max_amount NUMERIC NOT NULL,
  approver_role TEXT NOT NULL,                  -- 'employee' | 'manager' | 'cfo' | 'owner'
  requires_receipt BOOLEAN DEFAULT true,
  max_days_to_approve INTEGER DEFAULT 7,
  active BOOLEAN DEFAULT true
);

CREATE TABLE expense_approval_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action TEXT CHECK (action IN ('submitted','approved','rejected','returned','reimbursed','paid')),
  actor_name TEXT NOT NULL,
  actor_role TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2.6  נקודה 6 — מעקב קילומטראז' (Mileage Tracking)

**סטטוס: חסר לחלוטין. P1.**

אין שום אזכור של רכב, נסיעה, מד-קילומטר, או החזר-נסיעה. זה בעיה מיוחדת ב**חברת ייצור עם אתרי בניה**: העובדים נוסעים כל יום ברכבם הפרטי בין משרד לאתרים, ואמורים לקבל החזר מבוסס-ק"מ לפי תעריף מס הכנסה (2.60 ש"ח/ק"מ נכון ל-2026).

**דרישות חוקיות (ישראל):**
- מס הכנסה סעיף 17(1): החזר נסיעה מוכר כהוצאה רק אם מתועד ביומן-רכב (log-book) עם תאריך, יעדי-מוצא, יעד-הגעה, מטרת-נסיעה, מד-קילומטר התחלתי/סופי.
- חוב שמירת יומן רכב 7 שנים (סעיף 130 לפקודת מס הכנסה).
- חובת פיצול שימוש פרטי/עסקי עבור רכב צמוד.

**מה נדרש:**

```sql
CREATE TABLE employee_vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  plate_number TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  fuel_type TEXT CHECK (fuel_type IN ('petrol','diesel','hybrid','electric','plug_in_hybrid')),
  is_company_car BOOLEAN DEFAULT false,
  mileage_rate NUMERIC DEFAULT 2.60,             -- ש"ח / ק"מ (תעריף מס הכנסה)
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mileage_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL,
  vehicle_id UUID REFERENCES employee_vehicles(id),
  trip_date DATE NOT NULL,
  purpose TEXT NOT NULL,                         -- "פגישה עם לקוח X" / "פיקוח באתר Y"
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  odometer_start INTEGER,                        -- מד-קילומטר התחלתי (חובה לפי מס הכנסה)
  odometer_end INTEGER,                          -- מד-קילומטר סופי
  distance_km NUMERIC NOT NULL,
  rate_per_km NUMERIC NOT NULL DEFAULT 2.60,
  total_reimbursement NUMERIC GENERATED ALWAYS AS (distance_km * rate_per_km) STORED,
  project_id TEXT REFERENCES projects(id),
  trip_type TEXT CHECK (trip_type IN ('business','commute','personal','mixed')),
  round_trip BOOLEAN DEFAULT false,
  toll_cost NUMERIC DEFAULT 0,                  -- אגרות כביש
  parking_cost NUMERIC DEFAULT 0,
  gps_verified BOOLEAN DEFAULT false,           -- אם הוכנס מ-GPS app
  status TEXT DEFAULT 'draft' CHECK (status IN
    ('draft','submitted','approved','rejected','paid')),
  expense_id UUID REFERENCES expenses(id),      -- קישור להוצאה הכוללת
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mileage_employee ON mileage_log(employee_id);
CREATE INDEX idx_mileage_date ON mileage_log(trip_date DESC);
CREATE INDEX idx_mileage_project ON mileage_log(project_id);
```

**endpoint מינימלי:** `POST /api/mileage`, `GET /api/mileage/:employee_id/:month`, `POST /api/mileage/:id/approve`, `GET /api/mileage/export/tax-report` — ליצוא יומן רכב שנתי לרו"ח.

---

## 3. תמונת מצב — טבלת ציונים

| # | דרישה                                | ציון (1-10) | P   | מאמץ מוערך |
|---|---------------------------------------|-------------|-----|-------------|
| 1 | טבלת Expenses                         | 0           | P1  | יום-יומיים   |
| 2 | העלאת תמונת קבלה (קישור QA-47)       | 0           | P0  | 4-5 ימים (כולל QA-47) |
| 3 | תיוג קטגוריה                          | 0           | P2  | חצי יום     |
| 4 | הקצאה לפרויקט                        | 2 (רק PO)  | P1  | יום          |
| 5 | Workflow החזר                         | 0           | P1  | 2-3 ימים    |
| 6 | מעקב קילומטראז'                      | 0           | P1  | יום-יומיים   |
| — | **ממוצע משוקלל**                      | **0.3/10** | —   | **~2 שבועות לצוות של אחד** |

---

## 4. סיכונים ותלויות

### 4.1 סיכון ביקורת (Audit Risk) — P0

בעלת-שליטה/רו"ח **לא יכולים** לקבל דוח שחות של "כל ההוצאות בפרויקט". כרגע `analytics/spend-by-category` מציג רק את הקטגוריות של PO — ללא הוצאות המזומן של עובדים. זה פער ביקורת הלכתי.

### 4.2 סיכון מס הכנסה — P0

- אין יומן-רכב → נסיעות ברכב פרטי אינן מוכרות כהוצאה.
- אין קבלות סרוקות → הוצאות מזומן אינן מוכרות.
- אין קטגוריזציה מובנית → דיווח לרו"ח דורש סיווג ידני כל רבעון.

### 4.3 סיכון הלבנת הון — P1

תשלומי "פטי-קש" ללא תיעוד באמצעים אלקטרוניים עלולים לעבור את סף דיווח ע"פ חוק איסור הלבנת הון, תש"ס-2000 (50,000 ש"ח במזומן מצטבר לעסק בתקופה נתונה).

### 4.4 תלויות (Hard dependencies)

לפני שניתן לבנות את מודול ההוצאות:
1. **טבלת `employees`** חייבת להיבנות קודם (לא קיימת).
2. **טבלת `projects`** חייבת להיבנות קודם (לא קיימת, רק שדות TEXT).
3. **צינור העלאת קבצים (QA-47)** חייב להיבנות כולו — multer + sharp + file-type + rate-limit + Supabase Storage bucket.
4. **מנגנון authentication / roles** חייב להיות בנוי — אין כיום. `purchase_requests.requested_by` הוא TEXT חופשי, לא session-token.
5. **אינטגרציה לפייrול** אם רוצים החזר-אוטומטי (לא חובה בגרסה ראשונה).

---

## 5. המלצות מיידיות (Day 1)

1. **אל תבנה את מודול ההוצאות לפני שבונים את QA-47** — כל endpoint שיוסיף קבלה חשוף לחלוטין.
2. **הוסף את `employees` ואת `projects` כטבלאות מלאות** לפני מודול ההוצאות — אחרת אתה בונה על TEXT חופשי.
3. **התחל מ-P0: טבלת `expenses` + state-machine + 3 endpoints** (submit / approve / list). לא צריך OCR / רכב / split-project בגרסה ראשונה.
4. **תעדף P1-מיליאז' מעל P2-categories** — עובדים נוסעים כל יום, וזה הסיכון הגדול ביותר לאי-ציות מס.
5. **צור `QA-AGENT-144-PETTY-CASH-FLOAT`** שיתמקד ב-"יתרת קופה קטנה, חידוש, הפקדה, השוואה לבנק" — זה תת-מודול נפרד מהוצאות עובדים.

---

## 6. מפת תלויות (Forward References)

- `QA-AGENT-47-FILE-UPLOAD.md` — חובה לפני נקודה 2 (Receipt upload).
- `QA-AGENT-50-AUDIT-TRAIL.md` — חשוב לביקורת state-machine.
- `QA-AGENT-86-BITUACH-LEUMI.md` — קשור להחזרי הוצאות הנחשבות כהכנסה לעובד.
- `QA-AGENT-87-INCOME-TAX.md` — קשור לכללי ניכוי מ"ה ותעריף ק"מ.
- `QA-AGENT-38-MONEY-PRECISION.md` — קשור לטיפול בסכומים + מטבע.
- `QA-AGENT-37-STATE-MACHINE.md` — קשור למעבר המצבים של הוצאה.

---

**סוף QA-AGENT-143.**

**הכרעת סוכן:** כל שש הדרישות של QA-143 אינן קיימות כלל, לא במסד הנתונים ולא ב-API. פער מוצר עמוק. חובה לבנות תשתית בסיסית (employees + projects + file-upload pipeline מ-QA-47) לפני שניתן בכלל להתחיל במודול הוצאות.
