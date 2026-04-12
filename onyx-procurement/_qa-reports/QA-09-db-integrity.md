# QA-09 — Database Integrity Audit

**סוכן:** QA-09 — Database Integrity Agent
**מערכת:** ONYX Procurement + techno-kol-ops + onyx-ai (ERP לטכנו-קול עוזי)
**תאריך:** 2026-04-11
**סטטוס:** read-only audit — לא מחקתי ולא שיניתי נתונים; מיגרציות מוצעות בלבד

---

## 1. היקף ה-audit

| # | פרויקט | קבצי סכמה שנסרקו | טבלאות שנבדקו |
|---|--------|------------------|----------------|
| 1 | `onyx-procurement` | `supabase/migrations/000..007` (8 קבצים) | 45 טבלאות + 4 views |
| 2 | `techno-kol-ops` | `src/db/schema.sql` + `supabase/migrations/001-operations-core.sql` | 27 טבלאות |
| 3 | `onyx-ai` | אין קבצי `.sql` בספריה | 0 טבלאות (משתמש ב-Supabase של onyx-procurement כנראה) |
| 4 | `palantir_realtime_core` | `app/db/schema.sql` | מחוץ לסקופ ה-ERP (נסקר רק לזיהוי קיום) |

**לא קיימות סכמאות נפרדות עבור `onyx-ai` ולא עבור הרכיבים תחת `AI-Task-Manager` (רק `.sql` של customer_fields ו-quote_builder שהם מוצר אחר — לא ה-ERP).**

---

## 2. תמצית מנהלים — Go / No-Go

**החלטת QA-09 →  NO-GO עד לתיקון הבאגים ב-Severity `HIGH` ומעלה.**

| חומרה | ספירת ממצאים | סוגיות עיקריות |
|--------|-------------|----------------|
| `CRITICAL` | 4  | `techno-kol-ops` money ב-DECIMAL(12,2) תחת הנחת כסף × עם תקרה ~10M; התנגשות שם `projects` בין שתי migration chains; FK ללא `ON DELETE`; loop טרנזקציוני ללא rollback |
| `HIGH`     | 11 | הרבה שדות `NUMERIC` ללא scale ב-001; היעדר CHECK חיוביות; UNIQUE חסר על tax_id בחלק מהטבלאות; SELECT ללא LIMIT בקוד; generated columns לא validated |
| `MEDIUM`   | 17 | חסרים indexים על FK שימושיים, CHECK על ערכים סטטוסיים רק לפעמים, default values מפריעים לדיווח, מצבי ENUM לא אחידים |
| `LOW`      | 9  | שמות הטבלאות לא עקביים (plural vs singular), VARCHAR(20) למזהי טקסט במקום NATURAL KEY, comments חסרים |

**סיבות ה-No-Go:**
1. **שברי כסף:** `techno-kol-ops` משתמש ב-`DECIMAL(12,2)` עבור `contract_value`, `balance_due`, `total_price` וכד׳ — תקרה של 9,999,999.99 ₪ **פחות מערך של פרויקט תעשייתי אחד**. חייב לעבור ל-`NUMERIC(14,2)` כבר ב-migration דחוף.
2. **התנגשות בין טבלאות `projects`:** יש שתי טבלאות בשם `projects` — אחת ב-`techno-kol-ops/src/db/schema.sql` (UUID, 20 stages pipeline) ואחת ב-`onyx-procurement/supabase/migrations/005-annual-tax-module.sql` (SERIAL, חשבונאי). אם מריצים אותם על אותה instance Supabase — שבירה ודאית.
3. **Loop טרנזקציוני של customer_payments** מבצע עד N קריאות `UPDATE` **ללא טרנזקציה** — אם הסקריפט ייפול באמצע, יתרות חשבוניות יישארו במצב inconsistent (חלקם paid, חלקם לא).
4. **FK ללא `ON DELETE`** ב-`supplier_quotes.rfq_id`, `supplier_quotes.supplier_id`, `purchase_orders.rfq_id` ו-`purchase_orders.supplier_id` — מחיקת ספק תיכשל גם אם יש לו רק היסטוריה ישנה.

---

## 3. ממצאים לכל טבלה

### 3.1 `onyx-procurement/001-supabase-schema.sql` (18 טבלאות)

| # | טבלה | PK | NOT NULL | FK ON DELETE | UNIQUE | CHECK חיוביות | טיפוסי money | Indexes | ENUM/CHECK סטטוס | חומרה | בעיה + תיקון מוצע |
|---|------|----|----------|--------------|--------|---------------|---------------|---------|------------------|-------|-------------------|
| 1 | `suppliers` | OK (UUID) | name/contact_person/phone חובה | — | **חסר** על email, phone | חסר על `total_spent`, `total_negotiated_savings`, `distance_km` | `NUMERIC` ללא scale (תוקן חלקית ב-003) | אין על `active` / `name` / `phone` | rating/quality/reliability — OK | HIGH | חסר **UNIQUE(phone)** — אפשר להכניס אותו ספק פעמיים; `NUMERIC` ללא scale גרם לשגיאות עיגול לפני migration 003. תיקון: הוספת `UNIQUE(phone)` + CHECK `total_spent>=0`. |
| 2 | `supplier_products` | OK (UUID) | category/name/unit חובה | CASCADE (product_id) | אין | `current_price` ללא CHECK >= 0 | `NUMERIC` ללא scale | יש idx | אין | HIGH | `current_price` יכול להיות שלילי או אין; תיקון: `CHECK (current_price IS NULL OR current_price >= 0)`. |
| 3 | `price_history` | OK (UUID) | supplier_id/product_key/price | CASCADE על supplier | אין | `price` חסר CHECK >= 0 | `NUMERIC` | יש idx | source — CHECK יש | MEDIUM | לא מגן מפני מחירים שליליים; תיקון: `CHECK (price >= 0)`. |
| 4 | `purchase_requests` | OK (UUID) | requested_by חובה | — | — | אין על max_budget | אין money | אין idx על status | urgency/status — CHECK יש | MEDIUM | חסר index על `status` ו-`requested_by`; תיקון: `CREATE INDEX idx_pr_status ON purchase_requests(status)`. |
| 5 | `purchase_request_items` | OK (UUID) | quantity/name/unit | CASCADE (request_id) | — | **`quantity` ללא CHECK >0** | `max_budget` NUMERIC ללא scale | יש idx | אין | HIGH | `quantity` יכול להיות 0 או שלילי; תיקון: `CHECK (quantity > 0)`. |
| 6 | `rfqs` | OK (UUID) | response_deadline חובה | **חסר** (purchase_request_id) | — | אין | אין money | **אין idx על status ו-purchase_request_id** | status — CHECK יש | HIGH | FK רופף; מחיקת purchase_request תשאיר RFQ יתום; תיקון: `ON DELETE SET NULL`. חסר `CREATE INDEX idx_rfqs_pr ON rfqs(purchase_request_id)`. |
| 7 | `rfq_recipients` | OK (UUID) | rfq_id/supplier_id/supplier_name | CASCADE (rfq) / **חסר** (supplier) | אין — אפשר אותו ספק פעמיים ב-RFQ | — | — | יש idx | status CHECK יש | HIGH | חסר `UNIQUE(rfq_id, supplier_id)` — אפשר לשלוח RFQ כפול לאותו ספק, מעוות דוחות; תיקון: `UNIQUE (rfq_id, supplier_id)`. |
| 8 | `supplier_quotes` | OK (UUID) | total_price/total_with_vat/delivery_days | **חסר** על rfq_id ו-supplier_id | — | `total_price >= 0`? **לא** | תוקן ל-14,2 ב-003 | יש idx | source CHECK יש | CRITICAL | FK ללא ON DELETE: מחיקת RFQ או ספק → RESTRICT שבירה. תיקון: `ON DELETE CASCADE` ל-rfq_id; `ON DELETE RESTRICT` מפורש ל-supplier_id; CHECK `total_price >= 0`. |
| 9 | `quote_line_items` | OK (UUID) | quantity/unit_price/total_price | CASCADE (quote_id) | — | אין | תוקן ל-14,2 ב-003 | יש idx | — | HIGH | `quantity <= 0` אפשרי; `total_price != quantity*unit_price` לא נאכף; תיקון: CHECK חיוביות + (אופציונלי) `CHECK (ABS(total_price - quantity*unit_price*(1 - discount_percent/100)) < 0.02)`. |
| 10 | `purchase_orders` | OK (UUID) | subtotal/total/delivery_days | **חסר** rfq_id, supplier_id | — | אין | תוקן ל-14,2 ב-003 | idx יש | status CHECK יש | CRITICAL | כנ"ל — FK ללא ON DELETE. חסר CHECK `total >= 0`. `quality_result` CHECK כולל `NULL` כערך בתוך IN — תחביר שגוי (PostgreSQL לא מכבד NULL ב-CHECK IN כצפוי). תיקון: להסיר NULL מהרשימה; NULL מותר ממילא אם אין NOT NULL. |
| 11 | `po_line_items` | OK (UUID) | quantity/unit_price/total_price | CASCADE (po_id) | — | אין | תוקן ל-14,2 | יש idx | — | HIGH | כנ"ל כמו quote_line_items — חסר CHECK חיוביות. |
| 12 | `procurement_decisions` | OK (UUID) | — (הכל nullable!) | **חסר** על הכל (rfq_id, pr_id, po_id, selected_supplier_id) | — | — | תוקן ל-14,2 | אין idx על rfq_id | אין CHECK על decision_method | HIGH | טבלת החלטה קריטית שאין בה ולו NOT NULL אחד, כל השדות יכולים להיות NULL; מחיקת RFQ יוצרת record יתום. תיקון: NOT NULL לפחות על `selected_supplier_id`/`selected_total_cost`; `ON DELETE SET NULL` מפורש. |
| 13 | `subcontractors` | OK (UUID) | name/phone | — | **חסר** על phone | — | — | אין idx על name/active | — | MEDIUM | אפשר ספק משנה כפול. תיקון: `UNIQUE(phone)` + index על `active`. |
| 14 | `subcontractor_pricing` | OK (UUID) | work_type/percentage/price | CASCADE (subcontractor_id) | יש `UNIQUE(sub, type)` | **חסר** CHECK שאחוז בין 0-100 | תוקן ל-14,2 | יש | — | HIGH | `percentage_rate` יכול להיות 150%; תיקון: `CHECK (percentage_rate BETWEEN 0 AND 100)`. |
| 15 | `subcontractor_decisions` | OK (UUID) | work_type/project_value/area_sqm | **חסר** על selected_subcontractor_id | — | אין CHECK `area_sqm > 0` | תוקן ל-14,2 | אין idx על project_id | selected_pricing_method CHECK יש | HIGH | כמו #12; חסר `CHECK (area_sqm > 0)`. |
| 16 | `audit_log` | OK (UUID) | entity_type/action/actor | — | — | — | — | יש idx | — | LOW | OK, רק עדיף `CREATE INDEX CONCURRENTLY` על actor. |
| 17 | `system_events` | OK (UUID) | type/source/message | — | — | — | — | יש idx | severity CHECK יש | LOW | OK. |
| 18 | `notifications` | OK (UUID) | recipient/channel/title/message | — | — | — | — | יש idx | — | MEDIUM | severity בלי CHECK (חופשי); תיקון: `CHECK (severity IN ('info','warning','error','critical'))`. |

### 3.2 `003-migration-tracking-and-precision.sql`

| # | טבלה | ממצא | חומרה |
|---|------|------|-------|
| 19 | `schema_migrations` | PK=version TEXT — OK. `rolled_back` אין עקיבות למתי. | LOW |
| 20 | `vat_rates` | UNIQUE על `effective_from` — נכון, אבל **אין CHECK שחופשת ה-effective_to > effective_from**. אפשרי רשומה עתידית שגויה. | MEDIUM |

### 3.3 `004-vat-module.sql`

| # | טבלה | PK | NOT NULL | FK ON DELETE | UNIQUE | CHECK | money | Indexes | חומרה | בעיה + תיקון |
|---|------|----|----------|--------------|--------|-------|-------|---------|-------|--------------|
| 21 | `company_tax_profile` | SERIAL | company_name/legal_name/vat_file_number/company_id | — | **חסר UNIQUE(company_id)** | reporting_frequency CHECK | — | — | HIGH | ניתן ליצור שתי רשומות עם אותו ח"פ — קריטי ל-multi-entity. תיקון: `UNIQUE (company_id)`. |
| 22 | `vat_periods` | SERIAL | period_start/period_end/period_label/status/כל amounts | — | `UNIQUE(period_start, period_end)` | dates_valid, status CHECK | כל amounts `NUMERIC(14,2)` | יש idx | MEDIUM | `period_label` ללא UNIQUE — אפשר לכתוב `2026-04` פעמיים עם תאריכים שונים; תיקון: `UNIQUE (period_label)`. חסר CHECK ש-`net_vat_payable = vat_on_sales - vat_on_purchases - vat_on_assets`. |
| 23 | `tax_invoices` | SERIAL | invoice_type/direction/invoice_number/invoice_date/net_amount/vat_amount/gross_amount | **חסר** על vat_period_id | יש `UNIQUE(invoice_number, counterparty_id, invoice_type)` — **טוב** | IN חוקיים | `NUMERIC(14,2)` | יש idx | HIGH | מחיקת `vat_periods` תותיר חשבוניות יתומות. תיקון: `ON DELETE SET NULL` מפורש. חסר `CHECK (gross_amount = net_amount + vat_amount)` — מקרי קצה עיגול. |
| 24 | `vat_submissions` | SERIAL | vat_period_id/submission_type/submission_method/submitted_by/pcn836_* | **חסר** | — | CHECK על sub_type/method/status | — | יש idx | HIGH | `vat_period_id` הוא `NOT NULL REFERENCES vat_periods(id)` **ללא `ON DELETE`** — יחסום מחיקה של period. תיקון: `ON DELETE RESTRICT` מפורש (הכוונה הנכונה), אבל להוסיף. |

### 3.4 `005-annual-tax-module.sql`

| # | טבלה | חומרה | בעיה עיקרית + תיקון |
|---|------|-------|--------------------|
| 25 | `projects` (SERIAL) | **CRITICAL** | **התנגשות שם** עם `techno-kol-ops.projects` (UUID). גם שדות שונים לגמרי. אם שני הסכמות נפרסות על אותה instance — שבירה. תיקון: **שינוי שם ל-`finance_projects`** או schema נפרד `tax.projects`. |
| 26 | `customers` | HIGH | `UNIQUE(tax_id)` — טוב, **אבל** tax_id יכול להיות ריק (`NOT NULL` לא נאכף במלואו אם מועבר `''`). תיקון: `CHECK (length(tax_id) BETWEEN 8 AND 9)` וולידציית ספרת ביקורת. |
| 27 | `customer_invoices` | HIGH | `UNIQUE(invoice_number)` — **חסר scoping ל-employer/company**. אם יש multi-entity ≥ 2, אותו מספר חשבונית יתנגש. תיקון: `UNIQUE (invoice_number, customer_tax_id)` או טוב יותר `UNIQUE (employer_id, invoice_number)` לאחר הוספת employer_id. |
| 28 | `customer_payments` | HIGH | `invoice_ids INTEGER[]` — מערך רופף, לא FK; מונע שלמות של השמה לחשבוניות. תיקון: יצירת `customer_payment_allocations(payment_id, invoice_id, amount)` עם FK. |
| 29 | `fiscal_years` | MEDIUM | `UNIQUE(year)` OK. אין CHECK על `end_date > start_date`. תיקון: `CHECK (end_date > start_date)`. |
| 30 | `annual_tax_reports` | MEDIUM | `UNIQUE(fiscal_year, form_type)` OK. אין FK ל-`fiscal_years` — כלומר יכול להיות דוח לשנה שלא הוגדרה. תיקון: `FOREIGN KEY (fiscal_year) REFERENCES fiscal_years(year)` אחרי שמוסיפים UNIQUE על fiscal_years.year (כבר קיים). |
| 31 | `chart_of_accounts` | LOW | עצמי (`parent_id`) — OK. חסר CHECK למניעת cycles (אך קשה בלי recursive trigger). |

### 3.5 `006-bank-reconciliation.sql`

| # | טבלה | חומרה | בעיה עיקרית + תיקון |
|---|------|-------|--------------------|
| 32 | `bank_accounts` | MEDIUM | `UNIQUE(bank_code, branch_number, account_number)` טוב; **חסר `NOT NULL` על `currency`** (יש DEFAULT אבל לא NOT NULL). תיקון: להוסיף NOT NULL. |
| 33 | `bank_statements` | HIGH | `REFERENCES bank_accounts(id)` **ללא `ON DELETE`**; `opening_balance`/`closing_balance` ללא CHECK לפי currency. | תיקון: `ON DELETE RESTRICT` מפורש. |
| 34 | `bank_transactions` | HIGH | אותו דבר; **`amount` יכול להיות כל דבר** — היות ותנועה שלילית=חיוב תקינה, **חסר CHECK שהוא לא-אפס**. תיקון: `CHECK (amount <> 0)`. |
| 35 | `reconciliation_matches` | MEDIUM | `UNIQUE (bank_transaction_id, target_type, target_id)` טוב, אבל `target_id INTEGER` — רופף מול טבלאות עם `BIGINT` או `UUID` (polymorphic reference לא שלם). תיקון: או שדה נפרד `target_uuid` ו-`target_int`, או view חיצוני לאימות. |
| 36 | `reconciliation_discrepancies` | MEDIUM | אין FK ל-`bank_transaction_id` מפורש → יש אבל **חסר ON DELETE**. |

### 3.6 `007-payroll-wage-slip.sql`

| # | טבלה | חומרה | בעיה + תיקון |
|---|------|-------|---------------|
| 37 | `employers` | LOW | `UNIQUE(company_id)` OK. חסר CHECK על company_id להיות 9 ספרות. |
| 38 | `employees` | HIGH | `UNIQUE(employer_id, national_id)` טוב — מאפשר אותו עובד בין-מעסיקים. **חסר CHECK על `national_id`** שיהיה 9 ספרות. `hours_per_month DEFAULT 182` — אין CHECK `> 0`. תיקון: CHECK `hours_per_month > 0 AND hours_per_month <= 300`. |
| 39 | `wage_slips` | HIGH | `UNIQUE(employee_id, period_year, period_month)` — **חסר `employer_id`** בהקשר כ-employee יכול לעבור מעסיק. תיקון: `UNIQUE(employer_id, employee_id, period_year, period_month)`. CHECK `net_pay = gross_pay - total_deductions` — **טוב מאוד**. אבל אין CHECK שהן חיוביות. `amendment_of` self-reference ללא `ON DELETE RESTRICT` מפורש. |
| 40 | `employee_balances` | MEDIUM | Generated columns (`vacation_days_balance`, `sick_days_balance`) — טוב. `UNIQUE(employee_id, snapshot_date)` OK. **חסר** FK ON DELETE. |
| 41 | `payroll_audit_log` | LOW | BIGSERIAL OK. `INET` לכתובת IP — טוב. FK ללא ON DELETE (מכוון — לא רוצים למחוק audit). יש להוסיף `NOT NULL` על actor (כבר יש). |

### 3.7 `techno-kol-ops/src/db/schema.sql` (27 טבלאות)

**המון בעיות CRITICAL/HIGH — הסכמה הזו נראית כאילו נכתבה לפני migration 003:**

| # | טבלה | חומרה | בעיות עיקריות |
|---|------|-------|---------------|
| 42 | `clients` | **CRITICAL** | `credit_limit DECIMAL(12,2) DEFAULT 50000` — **תקרה ~10M₪**; `balance_due DECIMAL(12,2)` — כנ"ל; חסר UNIQUE על phone/email; אין CHECK `>=0`. תיקון: migrate ל-`NUMERIC(14,2)` + `CHECK (credit_limit >= 0)` + `CHECK (balance_due >= -credit_limit)`. |
| 43 | `suppliers` | HIGH | חסר UNIQUE(phone); חסר FK tax_id. |
| 44 | `employees` (UUID, בטכנו-קול) | **CRITICAL** | `salary DECIMAL(10,2) NOT NULL` — **תקרה 99,999,999.99, אבל בעיה יותר גדולה: `DECIMAL(10,2)` יגרום ל-overflow ב-annual rollup**. חסר UNIQUE(id_number) — אפשר אותו עובד פעמיים. `id_number VARCHAR(20)` ללא CHECK 9 ספרות. |
| 45 | `attendance` | HIGH | `hours_worked DECIMAL(4,2)` — תקרה 99.99 שעות — OK ליום אבל אין CHECK `>= 0 AND <= 24`; FK `employee_id` ללא ON DELETE. |
| 46 | `work_orders` | **CRITICAL** | PK = `VARCHAR(20)` (TK-XXXX) — לא UUID, לא SERIAL. הבעיה: אין CHECK שהוא `'TK-' || number`; אפשר להכניס ID לא-חוקי. `price DECIMAL(12,2)` ו-`cost_actual DECIMAL(12,2)` — תקרה 9.99M, פרויקט אחד יכול לעבור. `status VARCHAR(50) DEFAULT 'pending'` — **אין CHECK IN** על הערכים; `priority` — אותו דבר. תיקון: migrate ל-`NUMERIC(14,2)`, הוספת CHECK על status/priority, CHECK על quantity > 0. |
| 47 | `work_order_employees` | MEDIUM | `UNIQUE(order_id, employee_id)` טוב. FK ללא ON DELETE. |
| 48 | `material_items` | HIGH | `cost_per_unit DECIMAL(10,4)` — OK לספרות שברים, אבל לא עקבי עם שאר הכסף. `qty DECIMAL(12,2)` חסר CHECK `>= 0`. |
| 49 | `material_movements` | HIGH | `qty DECIMAL(12,2) NOT NULL` — חסר CHECK. `type VARCHAR(20)` ללא CHECK IN — כל מה ש-app שולח עובר. |
| 50 | `alerts` | LOW | `severity` ברירת מחדל `warning`, ללא CHECK IN — רופף אבל לא קריטי. |
| 51 | `financial_transactions` | **CRITICAL** | `amount DECIMAL(12,2) NOT NULL` — תקרה 10M; אין CHECK על `amount > 0` (תלוי בסוג — income לעומת expense). `type VARCHAR(50)` ללא CHECK IN — כל ערך. FK `order_id`, `client_id` ללא ON DELETE. |
| 52 | `users` | HIGH | `username UNIQUE` — טוב. חסר UNIQUE על `employee_id` (משתמש אחד ← עובד אחד). חסר CHECK `role IN (...)`. |
| 53 | `order_events` | MEDIUM | FK ללא ON DELETE. |
| 54 | `gps_locations` | MEDIUM | חסר index על `timestamp DESC` ל-most-recent queries. |
| 55 | `employee_current_location` | LOW | OK (1:1). |
| 56 | `tasks` | HIGH | `status VARCHAR(50) DEFAULT 'pending'` ללא CHECK IN. `type VARCHAR(50) NOT NULL` — חופשי. |
| 57 | `messages` | LOW | OK. |
| 58 | `leads` | MEDIUM | `estimated_value DECIMAL(12,2)` — כנ"ל תקרה; חסר CHECK. |
| 59 | `projects` (בטכנו-קול, עם pipeline_stage ENUM) | **CRITICAL** | **התנגשות שם עם onyx-procurement.projects**. `total_price DECIMAL(12,2)` — תקרה. `balance_due` generated — תלוי בכך ש-`advance_paid <= total_price` (אין CHECK!). תיקון: רענן ל-`NUMERIC(14,2)` + CHECK `advance_paid <= total_price`. |
| 60 | `pipeline_events` | LOW | OK (עם ENUM). |
| 61 | `approvals` | MEDIUM | `status VARCHAR(20) DEFAULT 'pending'` ללא CHECK IN. `required_from` חופשי — תיקון: CHECK. |
| 62 | `pipeline_notifications` | MEDIUM | `channel` ללא CHECK IN. |
| 63 | `client_tokens` | MEDIUM | `token VARCHAR(128) UNIQUE` טוב; `expires_at NOT NULL` טוב. חסר CHECK `expires_at > NOW()` (אבל זה constraint שלא מתקיים עם הזמן). |
| 64 | `survey_responses` | LOW | CHECK BETWEEN 1 AND 5 — טוב. |
| 65 | `payment_links` | HIGH | `amount DECIMAL(12,2)` ללא CHECK `> 0`; `paid_amount DECIMAL(12,2)` ללא CHECK `<= amount`. |

### 3.8 `techno-kol-ops/supabase/migrations/001-operations-core.sql` (4 טבלאות)

**הרבה יותר טוב — כתיבה מודרנית:**

| # | טבלה | חומרה | ממצא |
|---|------|-------|------|
| 66 | `jobs` | LOW | `NUMERIC(14,2)`, CHECKים מלאים, CASCADE נכון. **מצוין**. |
| 67 | `job_tasks` | LOW | כנ"ל. |
| 68 | `properties` | LOW | כנ"ל + `properties_money_nonneg` CHECK. |
| 69 | `contracts` | LOW | `contract_number UNIQUE` + CHECKים; טוב. אבל חסר `ON DELETE` מפורש על `job_id` (`SET NULL` — יש). |

**ההבדל בין schema.sql לבין 001-operations-core בולט. יש להחיל את אותם כללי איכות על הסכמה הישנה.**

### 3.9 `onyx-ai`

**אין קבצי .sql בפרויקט.** זה לכאורה פרויקט TypeScript שמתחבר ל-Supabase של onyx-procurement או משתמש ב-in-memory structures. אין חוב סכמה לבדוק.

---

## 4. ממצאים על הקוד (שלב 3)

### 4.1 SELECT ללא LIMIT (HIGH)

| קובץ | שורה | שאילתה | סיכון |
|------|------|--------|-------|
| `src/bank/bank-routes.js` | 15 | `.from('bank_accounts').select('*').order(...)` | נמוך-בינוני — bank_accounts מעטים. |
| `src/bank/bank-routes.js` | 134 | `.from('customer_invoices').select(...)` | **גבוה** — ללא limit, עם growth 1000+ חשבוניות יגרום ל-OOM. |
| `src/bank/bank-routes.js` | 138 | `.from('purchase_orders').select(...)` | **גבוה** — כנ"ל. |
| `src/bank/bank-routes.js` | 195 | `.from('v_unreconciled_summary').select('*')` | בינוני — view על רמת חשבון. |
| `src/payroll/payroll-routes.js` | 54 | `.from('employers').select('*').order(...)` | נמוך — יחסית קבוע. |
| `src/payroll/payroll-routes.js` | 70 | `.from('employees').select('*').order(...)` | **בינוני** — עם growth לאלפי עובדים יאיט. |
| `src/payroll/payroll-routes.js` | 346 | `.from('employee_balances').select(...)` | בינוני. |
| `src/tax/annual-tax-routes.js` | 14 | `.from('projects').select('*').order(...)` | **גבוה**. |
| `src/tax/annual-tax-routes.js` | 47 | `.from('customers').select('*').where(active=true)` | **גבוה** עם growth. |
| `src/tax/annual-tax-routes.js` | 137 | `.from('fiscal_years').select('*').order(...)` | נמוך. |
| `src/tax/annual-tax-routes.js` | 149 | `.from('customer_invoices').select(...).gte.lte.neq` | בינוני. |
| `src/tax/annual-tax-routes.js` | 157 | `.from('tax_invoices').select(...)` | בינוני. |
| `src/tax/annual-tax-routes.js` | 209-213 | 3 שאילתות עם טווח שנתי ללא limit | **גבוה** בשנה עם נפח. |
| `src/tax/annual-tax-routes.js` | 231 | `await supabase.from('chart_of_accounts').select('*')` | נמוך — קבוע. |
| `src/vat/vat-routes.js` | 88 | `.from('tax_invoices').select(...).eq.eq` | בינוני. |
| `src/vat/vat-routes.js` | 244 | `let q = ...('tax_invoices').select('*').order(...)` — ללא limit! | **גבוה**. |

**תיקון:** הוספת `.limit(parseInt(req.query.limit) || 100)` לכל ה-list endpoints.

### 4.2 UPDATE/DELETE ללא WHERE

**לא מצאתי UPDATE או DELETE ללא `.eq(...)`. טוב.** (כל ה-updateים עוברים דרך `.eq('id', ...)` או דומה.)

### 4.3 INSERT ללא שדות חובה

| קובץ | שורה | בעיה |
|------|------|------|
| `src/bank/bank-routes.js` | 21 | `supabase.from('bank_accounts').insert(req.body)` — **תלוי לחלוטין ב-req.body**, אין validation client-side שחובה שיהיה `account_name`, `bank_name`, `account_number`. ה-DB יזרוק. |
| `src/tax/annual-tax-routes.js` | 23 | `supabase.from('projects').insert({...req.body, created_by})` — אין וידוא ש-`project_code`, `name` קיימים. |
| `src/tax/annual-tax-routes.js` | 53 | `supabase.from('customers').insert(req.body)` — אין וידוא ש-`name`, `tax_id` קיימים. |
| `src/payroll/payroll-routes.js` | 60 | `supabase.from('employers').insert(req.body)` — אין וידוא של שדות חובה. |
| `src/payroll/payroll-routes.js` | 80 | `supabase.from('employees').insert({...req.body, created_by})` — אין validation של `employer_id`, `employee_number`, `national_id`, `first_name`, `last_name`, `start_date`, `employment_type`. |

**תיקון מוצע:** middleware validation (zod/joi) לפני כל POST.

### 4.4 JOIN שיוצר כפילויות (HIGH)

| קובץ | שורה | שאילתה | בעיה |
|------|------|--------|------|
| `src/tax/annual-tax-routes.js` | 62 | `.from('customer_invoices').select('*, customers(*), projects(*)')` | אם יש כמה projects לאותה חשבונית (אין, 1:1) — OK. אבל PostgREST expansion יכול ליצור כפילויות אם יש Ids לא ייחודיים בעצי ה-nested. סיכון בינוני. |

### 4.5 טרנזקציות חסרות (CRITICAL)

**הממצא הקריטי ביותר:** `src/tax/annual-tax-routes.js` שורות 110-127 (`customer_payments` POST handler):

```javascript
// Apply payment to invoices if linked
if (body.invoice_ids?.length) {
  let remaining = Number(body.amount);
  for (const invId of body.invoice_ids) {
    if (remaining <= 0) break;
    const { data: inv } = await supabase.from('customer_invoices').select('*').eq('id', invId).single();
    if (!inv) continue;
    const pay = Math.min(remaining, Number(inv.amount_outstanding));
    const newPaid = Number(inv.amount_paid) + pay;
    const newOutstanding = Number(inv.amount_outstanding) - pay;
    const newStatus = newOutstanding <= 0 ? 'paid' : 'partial';
    await supabase.from('customer_invoices').update({...}).eq('id', invId);
    remaining -= pay;
  }
}
```

**בעיה:** הלולאה מעדכנת N חשבוניות **ללא טרנזקציה**. אם הבקשה הראשונה מצליחה ושנייה נופלת (רשת, constraint, שגיאה) — המערכת נשארת במצב inconsistent: חלק מהחשבוניות `paid`, חלק לא, וה-`customer_payments` רשומה כאילו הכל תקין. Race condition + loss of money integrity.

**תיקון:**
- או להעביר את הלוגיקה ל-PostgreSQL function/stored procedure שכל כולה רצה בתוך טרנזקציה אחת.
- או להשתמש ב-RPC: `supabase.rpc('apply_payment_to_invoices', { payment_id, invoice_ids, amount })`.
- ודאי **לא** לבצע N updates מה-client ללא rollback.

**ממצא דומה ב-`src/bank/bank-routes.js` שורות 54-91:** יצירת statement + insert of transactions + update of account balance — גם כן ללא טרנזקציה. אם txErr קורה — `bank_statements` רשומה קיימת, transactions חסרים, balance לא עודכן.

### 4.6 Rollback חסר

- אין `BEGIN`/`COMMIT`/`ROLLBACK` בשום קובץ קוד של onyx-procurement. הכל מבוסס על supabase-js שהוא auto-commit לכל קריאה.
- `src/payroll/payroll-routes.js` שורה 231 (`wage_slips insert`) — טוב, פעולה יחידה.
- `src/vat/vat-routes.js` שורות 196-215 (`vat_submissions insert` + update period) — אותו pattern בעייתי.

---

## 5. סיכום הממצאים לפי חומרה

### CRITICAL (4)
1. `techno-kol-ops.financial_transactions.amount DECIMAL(12,2)` — תקרה 10M, לא מספיק.
2. התנגשות שם `projects` בין onyx-procurement/005 לטכנו-קול/schema.sql.
3. Loop של payment allocation ללא טרנזקציה (`src/tax/annual-tax-routes.js:110`).
4. FK ללא ON DELETE ב-`supplier_quotes`, `purchase_orders`.

### HIGH (11)
5. SELECT ללא LIMIT בעשרות endpointים.
6. שדות `NUMERIC` (ללא scale) ב-001 — תוקן חלקית ב-003 אך לא מלא.
7. חסר CHECK `>= 0` על רוב שדות הכסף והכמות.
8. `rfq_recipients` — אין UNIQUE על (rfq, supplier) — אפשר כפילויות.
9. `company_tax_profile` אין UNIQUE על `company_id`.
10. `customer_invoices.invoice_number UNIQUE` ללא scoping ל-employer.
11. `customer_payments.invoice_ids INTEGER[]` — אין FK table.
12. `employees.hours_per_month` ללא CHECK.
13. `wage_slips UNIQUE` ללא `employer_id`.
14. `techno-kol-ops.employees.salary DECIMAL(10,2)` — לא מספיק לrollup שנתי.
15. Bank statement import + transactions + balance update ללא טרנזקציה.

### MEDIUM (17)
טבלאות רבות עם בעיות שניתן לקבל בטווח הקצר (סטטוסים ללא CHECK IN, indexים חסרים, default values שמפריעים לדוחות).

### LOW (9)
עקביות שמות, comments חסרים, CHECK של cycles ב-chart_of_accounts.

---

## 6. פעולות מומלצות

1. **מיידי (PR דחוף):**
   - להריץ את `_qa-reports/QA-09-suggested-migrations.sql` כ-migration 008 לאחר בדיקה.
   - לעטוף את ה-payment allocation loop ב-Postgres function + RPC.
   - להוסיף `.limit()` ברירת מחדל לכל list endpoint.

2. **לפני פרודקשן:**
   - לשנות את שם `projects` באחת הסכמאות (המלצה: `finance_projects` ב-005).
   - להשלים את migrate-ל-`NUMERIC(14,2)` עבור `techno-kol-ops`.
   - להוסיף middleware validation (zod) לכל POST.

3. **תחזוקה שוטפת:**
   - להוסיף `_qa-reports/QA-09-integrity.test.js` ל-CI (ראו קובץ נלווה).
   - לעדכן את `mock-supabase.js` לתמוך ב-UNIQUE לכל הטבלאות.

---

## 7. Go / No-Go

**החלטת QA-09 → NO-GO** עד לפתרון 4 הממצאים ברמת `CRITICAL` ו-5 הממצאים הגבוהים ביותר ב-`HIGH` (ספציפית: #6, #7, #11, #14, #15).

**תנאי Go:**
1. מיגרציה 008 (מצורפת) הוחלה ב-staging ועברה את הטסטים.
2. `integrity.test.js` עובר ירוק ב-CI.
3. שינוי שם טבלת `projects` בוצע ותועד.
4. Payment allocation loop עבר ל-PostgreSQL RPC.
5. `.limit()` הוחל על כל ה-list endpoints.

---

*QA-09 — Database Integrity Agent — 2026-04-11. הדוח הזה read-only; שום נתון לא שונה ושום שאילתת DDL לא הורצה.*
