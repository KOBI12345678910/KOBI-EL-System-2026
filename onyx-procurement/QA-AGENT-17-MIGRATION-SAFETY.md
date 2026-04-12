# QA Agent #17 - Data Migration Safety & Schema Versioning

**תאריך:** 2026-04-11
**סוכן:** QA Agent #17
**ממד בדיקה:** בטיחות מיגרציות נתונים וניהול גרסאות סכמה
**שיטה:** בדיקה סטטית בלבד - ללא הרצה, ללא שינוי קבצים
**קבצים שנבחנו:**
- `supabase/migrations/001-supabase-schema.sql` (562 שורות)
- `supabase/migrations/002-seed-data-extended.sql` (321 שורות)

---

## Executive Summary - סיכום מנהלים

המערכת **אין בה אסטרטגיית מיגרציות אמיתית**. יש שני קבצי SQL גולמיים שרצים ידנית דרך Supabase SQL Editor, ללא כל תשתית מעקב גרסאות, rollback, או הגנה מפני ריצה כפולה. הסכמה עצמה בנויה במקרים רבים idempotent-ly (באמצעות `CREATE TABLE IF NOT EXISTS`), אבל האינדקסים, הטריגרים, וה-seed הם **לא idempotent** ויקרסו ברגע שיורץ הקובץ שוב. הסוכן הקודם ציין את F-06 לגבי בעיה אחת ספציפית ב-002; הבדיקה הזו מגלה **12 בעיות נוספות** בקטגוריית migration safety שלא נתפסו.

---

## 1. Migration Version Tracking - מעקב גרסאות

### M-01 - אין שום טבלה `schema_migrations` / `migrations_log`
**חומרה:** 🔴 קריטי - בעיה ארכיטקטורלית בסיסית
**מיקום:** כל הפרויקט

**ממצא:**
- אין טבלה `schema_migrations`, אין `migration_history`, אין `db_version`.
- אין שום דרך לדעת האם 001 רץ, 002 רץ, או באיזה סדר.
- אין column `applied_at`, אין `checksum`, אין `schema_version`.
- Supabase CLI לא מוגדר (אין `supabase/config.toml`, אין `supabase/seed.sql` קנוני).

**השלכה:**
- אם קובי או מישהו אחר ירוץ את 001 פעמיים - חלק ירוץ (IF NOT EXISTS), חלק יקרוס (indexes, triggers, views ללא IF NOT EXISTS).
- אם 003 יתווסף בעתיד, אין לדעת אילו שתיים קודמות היו כבר active.
- בעיה חמורה במיוחד בסביבת production: נניח שקובי יעדכן רק table אחת דרך Supabase UI, לא יהיה לוג של זה אל מול ה-schema repo.

**המלצה:**
```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  checksum TEXT,
  description TEXT
);
INSERT INTO schema_migrations (version, description) VALUES ('001', 'initial schema')
ON CONFLICT DO NOTHING;
```

---

### M-02 - אין naming convention עקבי עם timestamp
**חומרה:** 🟡 בינוני
**מיקום:** `supabase/migrations/`

**ממצא:**
- שמות הקבצים: `001-supabase-schema.sql`, `002-seed-data-extended.sql`.
- הפורמט הסטנדרטי של Supabase הוא `20240101120000_description.sql` (timestamp-based).
- הספרור 001/002 לא תואם לכלי Supabase CLI, מה שאומר ש-`supabase db push` לא יזהה אותם כמיגרציות רשמיות.

**השלכה:**
- אם קובי יחליט לעבור ל-Supabase CLI, הוא יצטרך rename גדול או למחוק ולהתחיל מחדש.
- שילוב עם CI/CD מצריך מבנה שונה.

---

## 2. Idempotency - האם ניתן להריץ שוב?

### M-03 - CREATE INDEX ללא `IF NOT EXISTS` - ייכשל ב-rerun
**חומרה:** 🟠 גבוה
**מיקום:** `001-supabase-schema.sql` שורות 60, 61, 77, 78, 110, 144, 145, 169, 170, 188, 231, 232, 233, 254, 309, 310, 350, 351, 366, 367, 388, 389

**ממצא:** כל 22 האינדקסים מוגדרים כ-`CREATE INDEX idx_...` ללא `IF NOT EXISTS`.

דוגמאות:
```sql
CREATE INDEX idx_supplier_products_category ON supplier_products(category);
CREATE INDEX idx_supplier_products_supplier ON supplier_products(supplier_id);
CREATE INDEX idx_price_history_supplier ON price_history(supplier_id);
CREATE INDEX idx_pr_items_request ON purchase_request_items(request_id);
CREATE INDEX idx_rfq_recipients_rfq ON rfq_recipients(rfq_id);
CREATE INDEX idx_quotes_rfq ON supplier_quotes(rfq_id);
CREATE INDEX idx_quote_lines_quote ON quote_line_items(quote_id);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_project ON purchase_orders(project_id);
CREATE INDEX idx_po_lines_po ON po_line_items(po_id);
CREATE INDEX idx_sub_pricing_sub ON subcontractor_pricing(subcontractor_id);
CREATE INDEX idx_sub_pricing_type ON subcontractor_pricing(work_type);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_events_type ON system_events(type);
CREATE INDEX idx_events_severity ON system_events(severity);
CREATE INDEX idx_notifications_recipient ON notifications(recipient);
CREATE INDEX idx_notifications_sent ON notifications(sent);
```

**השלכה:** אם קובי מריץ 001 שוב (כי הוא חושב שצריך, או כי הוא מתקן משהו באמצע), השורה הראשונה שתקרוס תהיה `CREATE INDEX idx_supplier_products_category` → `ERROR: relation "idx_supplier_products_category" already exists`. כל השורות מתחת לאותה שורה לא ירוצו - **מיגרציה חצי-רצה**. מצב DB לא עקבי.

**תיקון:** להחליף כל `CREATE INDEX x ON y(z)` ב-`CREATE INDEX IF NOT EXISTS x ON y(z)`.

---

### M-04 - CREATE TRIGGER ללא `IF NOT EXISTS` / DROP קודם
**חומרה:** 🟠 גבוה
**מיקום:** `001-supabase-schema.sql` שורות 403-407

```sql
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_supplier_products_updated BEFORE UPDATE ON supplier_products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_requests_updated BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_purchase_orders_updated BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subcontractors_updated BEFORE UPDATE ON subcontractors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**ממצא:** Postgres לא תומך ב-`CREATE TRIGGER IF NOT EXISTS`. ריצה שנייה תיתן `ERROR: trigger "trg_suppliers_updated" for relation "suppliers" already exists`.

**תיקון:** להוסיף `DROP TRIGGER IF EXISTS trg_suppliers_updated ON suppliers;` לפני כל CREATE TRIGGER. או לעטוף ב-DO block עם exception handling.

---

### M-05 - View `rfq_summary` מסתמך על `CREATE OR REPLACE VIEW` - חלקית תקין
**חומרה:** 🟢 נמוך
**מיקום:** `001-supabase-schema.sql` שורות 433, 456, 478

**ממצא:** שלושה views (`rfq_summary`, `supplier_dashboard`, `procurement_dashboard`) משתמשים ב-`CREATE OR REPLACE VIEW` - זה תקין ו-idempotent. **אבל:** אם עמודה של טבלה תחתית תשתנה (schema drift), `CREATE OR REPLACE VIEW` ייכשל עם `cannot change data type of view column`.

**תיקון מומלץ:** להקדים ב-`DROP VIEW IF EXISTS rfq_summary CASCADE;` לכל view. יותר בטוח בעדכוני סכמה.

---

### M-06 - Seed INSERT ב-001 עם `ON CONFLICT DO NOTHING` - תקין
**חומרה:** ✅ תקין
**מיקום:** `001-supabase-schema.sql` שורות 498-556

**ממצא:** INSERT-ים של ספקים, מוצרים, קבלנים ו-pricing ב-001 כולם מסתיימים ב-`ON CONFLICT DO NOTHING` (או `ON CONFLICT (...) DO UPDATE SET ...` ל-pricing). תקין לריצה חוזרת.

**הערה:** אבל `ON CONFLICT DO NOTHING` על INSERT של suppliers שאין להם UNIQUE constraint על `name` יכול לעקוף את ה-NOTHING לחלוטין - אין קונפליקט אם אין UNIQUE. וב-schema אין `UNIQUE (name)` על suppliers. התוצאה: **ריצה שנייה תיצור 5 ספקי duplicate**.

כלומר: `INSERT ... VALUES (...) ON CONFLICT DO NOTHING` בלי קונסטריינט - אותו דבר כמו בלי ON CONFLICT. ה-DO NOTHING רק מגן מפני PRIMARY KEY / UNIQUE, אבל suppliers.id הוא UUID שנוצר אוטומטית ואין UNIQUE על name → **duplicate מלא**.

---

### M-07 - `DELETE FROM suppliers WHERE name IN (...)` ב-002 תלוי ב-FK ללא CASCADE
**חומרה:** 🔴 קריטי (הרחבת F-06)
**מיקום:** `002-seed-data-extended.sql` שורות 11-17

```sql
DELETE FROM suppliers WHERE name IN (
  'מתכות השרון','ברזל ופלדה בע"מ','פלדת אילון','מתכת הדרום',
  'אלומין טק','אלו-פרו','נירו סטיל','זכוכית המרכז',
  'פנורמה זכוכית','צבעי טמבור','בורגי ישראל','טולס מאסטר',
  'Foshan Steel Trading','מתכת מקס','סטיל פרו','עיר הברזל',
  'אלומיניום ישראל','זכוכית השרון'
);
```

**ממצא - הרחבה מעבר ל-F-06 שכתב הסוכן הקודם:**

הסוכן הקודם זיהה ש-`subcontractors` ו-`supplier_products` בעייתיים. אבל `DELETE FROM suppliers` הוא הרבה יותר מסוכן - ספקים referenced ב-**7 טבלאות**:

| טבלה | עמודה | ON DELETE | מצב |
|------|-------|-----------|------|
| supplier_products | supplier_id | CASCADE | OK - ימחק אוטומטית |
| price_history | supplier_id | CASCADE | OK |
| rfq_recipients | supplier_id | (none) | 🔴 CRASH |
| supplier_quotes | supplier_id | (none) | 🔴 CRASH |
| purchase_orders | supplier_id | (none) | 🔴 CRASH |
| procurement_decisions | selected_supplier_id | (none) | 🔴 CRASH |

**השלכה מפורטת:** אחרי ש-קובי יפתח אפילו RFQ אחד לספק מאלה שיש ב-seed, ה-DELETE ב-002 ייכשל מיד: `ERROR: update or delete on table "suppliers" violates foreign key constraint on table "rfq_recipients"`. המיגרציה תיעצר באמצע, וכל ה-INSERT של 15 ספקים וה-80 מוצרים **לא ירוץ**. קובי יראה ריק + שגיאה.

**תיקון:**
1. להוסיף `ON DELETE SET NULL` או `ON DELETE CASCADE` ל-FKs ב-001 (פתרון אגרסיבי — יגרום לאובדן היסטוריה בטבלאות-צאצא).
2. או: להחליף את `DELETE FROM suppliers WHERE name IN (...)` ב-`INSERT ... ON CONFLICT (name) DO UPDATE SET ...` אחרי הוספת `UNIQUE(name)` לטבלת suppliers.
3. או: לפני DELETE להריץ DELETE cascade ידני על כל 7 הטבלאות. מסוכן כי ימחק RFQ/PO היסטוריה אמיתית.

הגישה הנכונה היא **לא להוריד ולהקים מחדש ספקים**, אלא upsert לפי שם.

---

### M-08 - 002 ללא טרנזקציה - כישלון חלקי משאיר DB בחצי-מצב
**חומרה:** 🔴 קריטי
**מיקום:** `002-seed-data-extended.sql` - הקובץ כולו

**ממצא:** אין `BEGIN;` / `COMMIT;` או `BEGIN; ... EXCEPTION WHEN OTHERS THEN ROLLBACK;`. כל שורה רצה כשאילתה עצמאית.

**השלכה:**
- אם שורת DELETE בתחילת הקובץ תצליח ושורה מאוחרת יותר (INSERT) תיכשל - ה-seed הישן נמחק, החדש לא נכנס, וה-DB ריק.
- כישלון באמצע INSERT-ים של products משאיר חלק מהספקים עם מוצרים, חלק בלי.

**תיקון:** לעטוף את כל 002 ב:
```sql
BEGIN;
-- כל ההכנסות
COMMIT;
```

---

### M-09 - `DELETE FROM subcontractor_pricing` / `subcontractors` / `supplier_products` - ללא תנאי
**חומרה:** 🟠 גבוה
**מיקום:** `002-seed-data-extended.sql` שורות 8-10

```sql
DELETE FROM subcontractor_pricing;
DELETE FROM subcontractors;
DELETE FROM supplier_products;
```

**ממצא:** שלושת ה-DELETE הללו הם **ללא WHERE** - מוחקים את **כל** הטבלה. זה destructive אמיתי. אם קובי ערך ידנית מחיר של ספק דרך הדשבורד, ואז יריץ 002 שוב - כל השינויים נמחקים.

**השלכה:**
- איבוד מידע שנערך ידנית
- `subcontractors` DELETE ללא WHERE ייכשל אם יש רשומות ב-`subcontractor_decisions` (אין CASCADE)
- `supplier_products` DELETE ללא WHERE ייכשל אם יש `price_history.product_id` references (יש `REFERENCES supplier_products(id)` ללא ON DELETE → default NO ACTION)

**תיקון:** להשתמש ב-upsert pattern (`INSERT ... ON CONFLICT (natural_key) DO UPDATE`) במקום truncate-and-reinsert.

---

## 3. Rollback / DOWN Migration

### M-10 - אין קובץ DOWN לכל מיגרציה
**חומרה:** 🟠 גבוה
**מיקום:** `supabase/migrations/`

**ממצא:** אין `001-supabase-schema.down.sql`, אין `001-rollback.sql`. אין כלל דרך לגלגל אחורה שינוי.

**השלכה:** אם מיגרציה חדשה (נניח 003) תכניס שדה שגוי או תפיל רגרסיה, אי אפשר לבטל אותה בלי לכתוב SQL ידני ולהפעיל אותו.

**תיקון:** לכל מיגרציה UP לכתוב מיגרציה DOWN מתאימה:
```sql
-- 001-supabase-schema.down.sql
DROP VIEW IF EXISTS procurement_dashboard CASCADE;
DROP VIEW IF EXISTS supplier_dashboard CASCADE;
DROP VIEW IF EXISTS rfq_summary CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS system_events CASCADE;
-- ... וכן הלאה
```

**הערה:** Supabase CLI תומך ב-rollback אוטומטי רק אם יש קובצי down נפרדים.

---

## 4. ALTER TABLE Patterns - Backward Compatibility

### M-11 - אין שימוש ב-ALTER TABLE - אבל זו בעיה בפני עצמה
**חומרה:** 🟡 בינוני
**מיקום:** כל `001`

**ממצא:** הסכמה הנוכחית בנויה מ-CREATE TABLE IF NOT EXISTS בלבד. **משמעות:** אי אפשר להוסיף עמודה חדשה לטבלה קיימת בלי ליצור מיגרציה חדשה (003) שמכילה `ALTER TABLE`. זה בסדר, אבל:

**הבעיה:** אם קובי יערך את 001 ידנית (שזה בדיוק מה שהוא יעשה - הוא לא מפתח מיגרציות), ויוסיף עמודה חדשה לטבלה, אז:
- ה-`CREATE TABLE IF NOT EXISTS` לא תיתן שגיאה - פשוט תתעלם (כי הטבלה קיימת).
- העמודה החדשה **לא תתווסף** לטבלה הקיימת.
- קוד ה-server יצפה לעמודה שלא קיימת → 500 Internal Server Error.

**דוגמה תיאורטית:** קובי רוצה להוסיף `supplier_category TEXT` ל-suppliers. הוא יערך את 001 ויוסיף את השורה. יריץ את 001 שוב. שום דבר לא יקרה (IF NOT EXISTS). ה-API יקרוס.

**המלצה:** להוסיף למסמכים/README:
> "עדכוני סכמה לאחר deployment ראשון - חייבים להיכתב כקובץ 003/004/... עם ALTER TABLE, לא כעריכה של 001."

---

### M-12 - `CREATE OR REPLACE FUNCTION update_updated_at()` - תקין
**חומרה:** ✅ תקין
**מיקום:** שורות 394-400, 410-430

**ממצא:** שתי הפונקציות משתמשות ב-`CREATE OR REPLACE FUNCTION` - idempotent ותקין.

---

## 5. Data Backfill Safety

### M-13 - אין zero-downtime pattern למיגרציות
**חומרה:** 🟡 בינוני
**מיקום:** כל הארכיטקטורה

**ממצא:** אין שום מנגנון backfill. דוגמה: אם קובי יוסיף בעתיד עמודה `supplier_tier TEXT` שצריכה להיות מחושבת מערכים קיימים (דוגמה: `rating >= 8 → 'premium'`), אין תבנית לעשות את זה בשלבים:
1. ALTER TABLE ADD COLUMN supplier_tier TEXT (nullable - מהיר, safe)
2. UPDATE חלקי של backfill (באצווה, עם LIMIT + WHERE supplier_tier IS NULL)
3. ALTER TABLE ALTER COLUMN supplier_tier SET NOT NULL (אחרי backfill מלא)

**השלכה:** כל שינוי schema עם backfill יצטרך downtime.

**המלצה:** לתעד תבנית backfill זו ב-README של migrations.

---

### M-14 - `DEFAULT` ב-columns חדשים - חסר הוראות מחייבות
**חומרה:** 🟢 נמוך
**מיקום:** rule כללי

**ממצא:** ב-001, כל העמודות החדשות מוגדרות עם DEFAULTs טובים (`DEFAULT '{}'` ל-arrays, `DEFAULT NOW()` ל-timestamps, `DEFAULT 5` ל-ratings). זה **יתרון** - ALTER TABLE עתידי עם DEFAULT על עמודה NOT NULL בתא ריק יצטרך backfill. אבל כאן הוא כבר מוגדר. OK.

---

## 6. Re-run Safety - הרחבה של F-06

### M-15 - INSERT של 15 suppliers ב-002 - ללא UNIQUE(name) → duplicates
**חומרה:** 🔴 קריטי
**מיקום:** `002-seed-data-extended.sql` שורות 21-42

**ממצא:** ה-INSERT של 15 ספקים בתחילת 002 לא מכיל `ON CONFLICT`. ה-DELETE לפניו (שורות 11-17) ימחק את אותם 15 הספקים **אם הם עם השמות המדויקים שמופיעים ב-IN list**. אבל:

1. אם ה-DELETE ייכשל (M-07) → השמות עדיין קיימים → INSERT יוצר 15 **חדשים** → כעת יש 30 ספקים.
2. אם משתמש עדיין ישנה שם של ספק קיים ("מתכות השרון" → "מתכות השרון בע\"מ") → DELETE לא יתפוס אותו → INSERT יוצר אחד חדש.
3. אין `ON CONFLICT` ב-INSERT הזה. אפילו אם היה UNIQUE constraint, זה יקרוס.

**תיקון מוצע:** להוסיף `UNIQUE (name)` ל-suppliers table ב-001, ואז להוסיף `ON CONFLICT (name) DO UPDATE SET ...` ל-INSERT.

---

### M-16 - INSERT של `supplier_products` משתמש ב-CROSS JOIN על `WHERE s.name = ...` - שביר
**חומרה:** 🟠 גבוה
**מיקום:** `002-seed-data-extended.sql` שורות 47-241

**ממצא:** דוגמה מייצגת:
```sql
INSERT INTO supplier_products (supplier_id, ...)
SELECT s.id, v.cat, v.name, ...
FROM suppliers s, (VALUES (...)) AS v(...)
WHERE s.name = 'מתכות השרון';
```

אם ה-DELETE של suppliers ייכשל (M-07) או יחזור חסר (כל 15 הספקים הישנים עדיין שם) - לפעמים יהיה **כפל ספקים** בשם זהה. אז `WHERE s.name = 'מתכות השרון'` יחזיר **שתי שורות**, וה-INSERT יוסיף את כל המוצרים **פעמיים**.

**השלכה:** 160 מוצרים duplicate אחרי ריצה שנייה של 002 במצב failure partial.

**תיקון:** להוסיף `LIMIT 1` ל-select, או לבסס על UUID מוגדר-מראש, או לעבוד עם CTE.

---

### M-17 - Triggers `trg_*_updated` - ייצרו בעיה ב-002 אם רץ שוב
**חומרה:** 🟠 גבוה
**מיקום:** `001-supabase-schema.sql` שורות 403-407 + 002 כללי

**ממצא:** ה-triggers `update_updated_at()` מעדכנים את `updated_at` אוטומטית ב-UPDATE. זה תקין. אבל:

**בעיה עדינה:** אם ה-DELETE+INSERT של ספקים ב-002 רץ שוב, ה-INSERT מייצר ספקים חדשים עם UUIDs חדשים → **supplier_id ב-RFQ, PO, quotes יצביעו ל-UUIDs הישנים שלא קיימים יותר**. FK ירדוף ל-"foreign key violation on cascade".

כן, ה-DELETE ייכשל (M-07), אבל בלי ה-DELETE, ה-INSERT עובד והשמות יהפכו ל-dupe. לא משנה מאיזו זווית נסתכל - **002 לא idempotent**.

---

## 7. Foreign Key Audit - ON DELETE

### M-18 - Foreign key gaps - עקביות לא אחידה
**חומרה:** 🟠 גבוה
**מיקום:** `001-supabase-schema.sql` כל טבלה

**מיפוי מלא של כל FKs:**

| טבלה | עמודה | מצביע ל | ON DELETE | הערה |
|------|-------|---------|-----------|------|
| supplier_products | supplier_id | suppliers | CASCADE | OK |
| price_history | supplier_id | suppliers | CASCADE | OK |
| price_history | product_id | supplier_products | (none) | 🔴 re-run block (F-06) |
| purchase_request_items | request_id | purchase_requests | CASCADE | OK |
| rfqs | purchase_request_id | purchase_requests | (none) | 🟡 delete PR ייכשל |
| rfq_recipients | rfq_id | rfqs | CASCADE | OK |
| rfq_recipients | supplier_id | suppliers | (none) | 🔴 M-07 |
| supplier_quotes | rfq_id | rfqs | (none) | 🟡 delete RFQ ייכשל |
| supplier_quotes | supplier_id | suppliers | (none) | 🔴 M-07 |
| quote_line_items | quote_id | supplier_quotes | CASCADE | OK |
| quote_line_items | item_id | purchase_request_items | (none) | 🟡 |
| purchase_orders | rfq_id | rfqs | (none) | 🟡 |
| purchase_orders | supplier_id | suppliers | (none) | 🔴 M-07 |
| po_line_items | po_id | purchase_orders | CASCADE | OK |
| procurement_decisions | rfq_id | rfqs | (none) | 🟡 |
| procurement_decisions | purchase_request_id | purchase_requests | (none) | 🟡 |
| procurement_decisions | purchase_order_id | purchase_orders | (none) | 🟡 |
| procurement_decisions | selected_supplier_id | suppliers | (none) | 🔴 M-07 |
| subcontractor_pricing | subcontractor_id | subcontractors | CASCADE | OK |
| subcontractor_decisions | selected_subcontractor_id | subcontractors | (none) | 🔴 F-06 |

**סיכום:** מתוך 20 FKs, רק 7 הם CASCADE. 13 הם NO ACTION (default). זו **חוסר עקביות מסוכן**: טבלאות "בנות ישירות" (products ל-suppliers) עם CASCADE, אבל טבלאות "בנות עקיפות" (rfq_recipients ל-suppliers) בלי - זה לא תואם לאיזו שיטה ברורה.

**השלכה:** כל ניסיון למחוק ספק, RFQ, או PO דרך SQL ייכשל אם יש רשומות בטבלאות שלא מוגדרות CASCADE. אפילו פעולה פשוטה של "למחוק ספק לא רלוונטי" דורשת 6 DELETE-ים ידניים.

**תיקון:** לבחור גישה ועקביה:
- **גישה 1 (aggressive):** כל FK → `ON DELETE CASCADE`. כואב אבל אחיד.
- **גישה 2 (preservation):** כל FK → `ON DELETE SET NULL` ל-columns nullable, `ON DELETE RESTRICT` ל-NOT NULL. משמר היסטוריה, דורש "soft delete" בלבד.
- **גישה 3 (current chaos):** להמשיך כמו שהיום, אבל **לתעד** ולהוסיף מנגנון UI שחוסם מחיקה של ישויות עם dependencies.

---

## 8. Destructive Statements

### M-19 - אין DROP TABLE בקבצים עצמם
**חומרה:** ✅ OK
**ממצא:** אין שום `DROP TABLE`, `DROP SCHEMA`, `TRUNCATE`. כל ההרס מוגבל ל-3 DELETEים ב-002 (שזה מספיק רע, ראה M-09).

---

### M-20 - אין RLS policies - חסר כניסה מבחינת rollout שלבי
**חומרה:** 🟡 בינוני
**מיקום:** `001-supabase-schema.sql` שורות 490-493

**ממצא:** RLS מופיע רק כ-**קוד מסומן**:
```sql
-- ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for authenticated" ON suppliers FOR ALL USING (auth.role() = 'authenticated');
```

**השלכה מבחינת migration safety:**
- אם RLS יופעל בעתיד (מיגרציה 003), המיגרציה עצמה תצטרך להיות תשומת-לב-מיוחדת: הפעלת RLS על טבלה קיימת עם נתונים **מיד חוסמת** את כל הגישה עד שתוגדר policy. הדבר יוצר downtime.
- אין תבנית לזה ב-migrations. סיכון.

**המלצה:** לתעד את התהליך הנכון להפעלת RLS:
1. CREATE POLICY (ללא ENABLE) - מסווים את הקונפיג
2. טסט מול מצב staging
3. ENABLE RLS
4. מוניטור שגיאות 403 ב-API

---

## Summary Table - טבלת סיכום חוסר עקביות

| ID | תיאור | חומרה | קטגוריה |
|----|-------|-------|---------|
| M-01 | אין schema_migrations table | 🔴 קריטי | Versioning |
| M-02 | Naming לא תואם ל-Supabase CLI | 🟡 בינוני | Tooling |
| M-03 | 22 אינדקסים ללא IF NOT EXISTS | 🟠 גבוה | Idempotency |
| M-04 | 5 triggers ללא DROP קודם | 🟠 גבוה | Idempotency |
| M-05 | Views עם CREATE OR REPLACE (partial) | 🟢 נמוך | Idempotency |
| M-06 | ON CONFLICT DO NOTHING בלי UNIQUE(name) | 🔴 קריטי | Idempotency |
| M-07 | DELETE suppliers נחסם ע"י 4 FKs ללא CASCADE | 🔴 קריטי | FK |
| M-08 | 002 ללא טרנזקציה | 🔴 קריטי | Atomicity |
| M-09 | DELETE ללא WHERE הורג נתונים ידניים | 🟠 גבוה | Destructive |
| M-10 | אין קובצי DOWN | 🟠 גבוה | Rollback |
| M-11 | CREATE TABLE IF NOT EXISTS לא מעדכן columns | 🟡 בינוני | ALTER |
| M-12 | functions עם CREATE OR REPLACE | ✅ OK | Idempotency |
| M-13 | אין תבנית backfill zero-downtime | 🟡 בינוני | Backfill |
| M-14 | DEFAULTs טובים ב-001 | ✅ OK | Backfill |
| M-15 | INSERT suppliers ב-002 יוצר duplicates | 🔴 קריטי | Re-run |
| M-16 | CROSS JOIN על WHERE name - מכפיל products | 🟠 גבוה | Re-run |
| M-17 | triggers tracking updated_at לא רלוונטיים להדקר re-run | 🟠 גבוה | Re-run |
| M-18 | 13 FKs ללא CASCADE - שביר | 🟠 גבוה | FK |
| M-19 | אין DROP TABLE בקבצים | ✅ OK | Destructive |
| M-20 | RLS כקומנט בלבד - rollout פוטנציאלי מסוכן | 🟡 בינוני | RLS rollout |

**סה"כ ממצאים חדשים:** 20 (17 בעיות + 3 OK)
- 🔴 קריטיים: 5
- 🟠 גבוהים: 7
- 🟡 בינוניים: 4
- 🟢 נמוכים: 1
- ✅ תקין: 3

---

## המלצות פעולה - בסדר עדיפות

### עדיפות 1 (לפני pre-production)
1. **M-07 / M-15:** להוסיף `UNIQUE(name)` ל-suppliers ולעבור ל-upsert pattern ב-002.
2. **M-08:** לעטוף את כל 002 ב-BEGIN/COMMIT.
3. **M-03:** להחליף `CREATE INDEX` ב-`CREATE INDEX IF NOT EXISTS` בכל 22 המקומות.
4. **M-04:** להוסיף `DROP TRIGGER IF EXISTS` לפני 5 ה-triggers.
5. **M-01:** להוסיף טבלת `schema_migrations` בתחילת 001.

### עדיפות 2 (לפני scale)
6. **M-18:** לבחור גישה עקבית ל-FKs ולעדכן את כל 13 הגאפס.
7. **M-10:** לכתוב קובץ `001-supabase-schema.down.sql`.
8. **M-16:** להמיר את ה-CROSS JOIN ל-CTE עם constraint ברור.

### עדיפות 3 (תחזוקה ארוכת טווח)
9. **M-11:** לכתוב מדריך ב-README על איך ALTER TABLE שיתווסף כמיגרציה חדשה.
10. **M-20:** לתעד תהליך RLS rollout.
11. **M-02:** לשקול מעבר ל-Supabase CLI עם timestamp naming.

---

## הערה לגבי חפיפה עם F-06 של Wave 1

הסוכן הקודם (Wave 1) ציין ב-F-06 שתי בעיות:
1. `subcontractors` DELETE ייכשל בגלל `subcontractor_decisions` FK.
2. `supplier_products` DELETE ייכשל בגלל `price_history.product_id` FK.

הוא הציע לתקן ע"י הוספת DELETE-ים נוספים. **הבדיקה שלי מראה שזה רק קצה הקרחון:** אותה בעיה קיימת על **20 FKs שונים** ו-7 טבלאות נוספות, ולכן הגישה של "להוסיף עוד DELETE-ים" לא פתרון יציב. הפתרון הנכון הוא **לעבור ל-upsert pattern** במקום delete-and-reinsert.

כל המיגרציה של 002 בנויה על ההנחה ש-database ריק, וזה **לא יהיה נכון** אחרי שימוש ראשון של קובי.

---

**סוף דוח QA Agent #17**
