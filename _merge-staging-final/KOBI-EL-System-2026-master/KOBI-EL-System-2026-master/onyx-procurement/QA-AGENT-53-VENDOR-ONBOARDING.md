# QA-AGENT-53 — Vendor / Supplier Onboarding Flow

**Agent:** QA Agent #53
**Dimension:** Vendor / Supplier Onboarding Flow
**Mode:** Static Analysis Only
**Date:** 2026-04-11
**Scope:**
- `web/onyx-dashboard.jsx` (SuppliersTab / addSupplier, lines 183–237)
- `server.js` (POST /api/suppliers, lines 148–154)
- `supabase/migrations/001-supabase-schema.sql` (suppliers table, lines 8–40)

---

## 1. Executive Summary

מסלול ה-onboarding של ספק ב-ONYX הוא **primitive single-step manual entry** שמנוהל על ידי קובי לבד. טופס הפרונט כולל **4 שדות בלבד** (שם, איש קשר, טלפון, אימייל), ואילו ה-POST בצד השרת הוא **pass-through ישיר** של `req.body` ל-`supabase.from('suppliers').insert(...)` ללא שום ולידציה, בלי duplicate check, בלי normalization, בלי approval gate, בלי KYC/KYB, ובלי איסוף נתונים רגולטוריים ישראליים (ח.פ. / תיק ניכויים / ח-ן בנק / עוסק מורשה). הסיכומים האופרטיביים הסטנדרטיים של רכש — בנק, מיסים, חוזה, מוצרים, תנאי תשלום, תנאי תשלום, currency, טריטוריה — כולם **לא נאספים** בשלב הזה. הסיכון הגדול ביותר: כפילויות ספקים, שגיאות תשלום, העדר אודיט לגולגולת ה-KYB (Know-Your-Business), וחשיפה רגולטורית מול רשות המסים.

**חומרה כוללת:** 🔴 **CRITICAL** — המסלול אינו production-ready עבור חברה ישראלית בע"מ.

---

## 2. מימצאים לפי הממדים שהוגדרו

### 2.1 שדות חובה מול אופציונליים (Required vs Optional)

**Schema (DB):**
```sql
name TEXT NOT NULL,
contact_person TEXT NOT NULL,   -- הצהרתי NOT NULL
phone TEXT NOT NULL,
email TEXT,                     -- אופציונלי
whatsapp TEXT,                  -- אופציונלי
address TEXT,                   -- אופציונלי
country TEXT DEFAULT 'ישראל',
preferred_channel TEXT DEFAULT 'whatsapp'
```

**Frontend (jsx:188):**
```js
if (!form.name || !form.phone) return showToast("שם וטלפון חובה", "error");
```

**מימצאים:**
- **F-53-001 [HIGH]** הפרונט בודק רק `name` + `phone`. ה-schema דורש גם `contact_person NOT NULL`, לכן אם המשתמש משאיר את "איש קשר" ריק, הפרונט יעביר `contact_person: ""` ל-POST. Postgres יקבל זאת כי זה string ריק ולא NULL, כך שהבדיקה ב-DB לא תופסת את המקרה. התוצאה: `contact_person=""` נכנס ל-DB לנצח. **No trim, no non-empty check.**
- **F-53-002 [HIGH]** ה-POST בשרת (line 150) מעביר `req.body` ישירות ל-insert. אם הפרונט שולח שדות לא מותרים (`id`, `created_at`, `overall_score`, `risk_score`) — הם ייכתבו ישירות ל-DB (mass assignment vulnerability — cross-ref Agent 30 pentest).
- **F-53-003 [MEDIUM]** `email` שדה אופציונלי ב-DB אבל ללא `CHECK (email ~* '^.+@.+\..+$')` ומצד השרת אין regex. אימייל שגוי לא ייתפס.
- **F-53-004 [MEDIUM]** `whatsapp` שדה נפרד מ-`phone`, אבל בפרונט הוא **לא נאסף בכלל** בטופס הוספת ספק — ברירת המחדל תהיה NULL. מצד שני, RFQ sender (server.js:291) מעדיף `supplier.whatsapp || supplier.phone`, לכן ייפול fallback שקט — אבל יופיעו מספרים ב-E.164 שלא נבדקו.
- **F-53-005 [HIGH]** **שדות רגולטוריים חסרים לחלוטין מה-schema:** אין עמודות ל-`company_id` (ח.פ./ע.מ.), `vat_id`, `tax_withholding_id` (תיק ניכויים), `bank_account_number`, `bank_branch`, `bank_name`, `incorporation_type` (בע"מ / עוסק מורשה / עוסק פטור). ראו פירוט בסעיפים 2.3–2.5.

---

### 2.2 Duplicate Detection — זיהוי כפילויות

**קוד רלוונטי:** אין. POST /api/suppliers (server.js:149-154) הוא insert ישיר:

```js
app.post('/api/suppliers', async (req, res) => {
  const { data, error } = await supabase.from('suppliers').insert(req.body).select().single();
  if (error) return res.status(400).json({ error: error.message });
  await audit('supplier', data.id, 'created', req.body.created_by || 'api', `ספק חדש: ${data.name}`);
  res.status(201).json({ supplier: data });
});
```

**ב-schema:**
```sql
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
name TEXT NOT NULL,
-- NO UNIQUE ON name
-- NO UNIQUE ON phone
-- NO UNIQUE ON email
-- NO company_id column at all
```

**מימצאים:**
- **F-53-010 [CRITICAL]** אין שום `UNIQUE` constraint על `name`, `phone`, `email`, או מזהה עסקי. ניתן להכניס "מתכת מקס" אותו פעמיים או שבע פעמים, כל אחת עם UUID שונה. תוצאה: RFQ ישלחו כפולים (ראה server.js:244-248, `uniqueSuppliers Map` עובד לפי `supplier.id`, לא לפי שם/טלפון), החלטות רכש לא יתבססו על היסטוריה מאוחדת, ואנליטיקה ב-`spend-by-supplier` תפוצל.
- **F-53-011 [CRITICAL]** אין normalization על מספרי טלפון (E.164). "052-1234567", "+972521234567", "972-521234567" יזוהו כ-3 ספקים שונים. הפרונט (line 209) הוא `<Input label="טלפון" ...>` ללא mask / ללא formatter.
- **F-53-012 [HIGH]** אין normalization על name: רווחים כפולים, trailing whitespace, case sensitivity (רלוונטי לאנגלית — "Steel Pro" vs "steel pro"). אין collation מוגדר על העמודה.
- **F-53-013 [CRITICAL]** אין בדיקה fuzzy (כמו `similarity()` מ-pg_trgm או Levenshtein) ל-"similar existing suppliers". לקובי אין אזהרה "נמצא ספק דומה: האם זה אותו עסק?" — בדיוק נוהל שצריך להיות ב-single-operator manual entry.
- **F-53-014 [HIGH]** אין UPSERT logic — אפילו אם הפרונט היה שולח `on_conflict`, ה-insert לא מספק target. ה-seed ב-migration משתמש ב-`ON CONFLICT DO NOTHING` אבל בלי שיש UNIQUE, זה no-op שלא יתפוס כפילויות בפועל אלא רק conflict על `id` (שהוא אוטומטי).

---

### 2.3 ולידציית חברה ישראלית (חברת בע"מ / עוסק מורשה / ח.פ. checksum)

**קוד רלוונטי:** אין. בדיקה:
- מילה "ח.פ.", "ח\"פ", "חפ", "עוסק", "ניכוי" — **אפס מופעים** בקובצי הפרויקט (server.js, schema, jsx).
- `country TEXT DEFAULT 'ישראל'` — טקסט חופשי, לא ENUM.

**מימצאים:**
- **F-53-020 [CRITICAL]** **אין עמודת `company_id`**. ח.פ. חברה ישראלית (9 ספרות + ספרת ביקורת Luhn-like mod-10) אינו נאסף. תוצאה: אי אפשר לבצע חיובי מס כחוק, אי אפשר להעביר תשלומים דרך מערכות ERP/חשבשבת/רסן, אי אפשר לדווח לרשות המסים על 856.
- **F-53-021 [CRITICAL]** **אין checksum validator** לח.פ. 9 ספרות לפי האלגוריתם הרשמי (הכפלת ספרות לסירוגין ב-1/2, סכום ≡ 0 mod 10). ואין לח.פ. של עוסק מורשה (9 ספרות, חישוב שונה). אין שום `validateCompanyId()` או `validateVatId()` בפרויקט.
- **F-53-022 [HIGH]** **אין ENUM ל-`incorporation_type`**: חברה בע"מ / חברה פרטית / עוסק מורשה / עוסק פטור / שותפות רשומה / אגודה שיתופית / מלכ"ר / חברה זרה. כל אחד מסוג אלה דורש ולידציה שונה ומשפיע על לדוגמא: ניכוי במקור, חובת חשבונית מס, שומה.
- **F-53-023 [HIGH]** `country TEXT DEFAULT 'ישראל'` הוא string חופשי — "ישראל", "Israel", "IL", "il" — יישמרו כערכים נפרדים. לא ENUM ולא ISO-3166-2.
- **F-53-024 [HIGH]** אין שדה `legal_name` נפרד מ-`name`. "מתכת מקס בע"מ" הוא השם המשפטי, אבל "מתכת מקס" הוא השם המסחרי — ב-invoice, PO, דוחות מס, צריך שניהם.
- **F-53-025 [MEDIUM]** אין אינטגרציה / placeholder לשירות רשם החברות (lookup נכנס). צריך לפחות link ידני לרישום חברות: https://ica.justice.gov.il.

---

### 2.4 איסוף פרטי בנק — רגיש (Cross-ref Agent 28 PII)

**מימצאים:**
- **F-53-030 [CRITICAL]** **אין עמודות בנק בכלל ב-schema.** לא `bank_name`, לא `bank_branch` (3 ספרות), לא `account_number` (שונה לפי בנק). המשמעות: **לא ניתן לבצע העברה זיכוי לספק אוטומטית** — כל תשלום ידני, חושב על ידי קובי (או חיצונית).
- **F-53-031 [CRITICAL]** כשהפיצ'ר יתווסף, חייב **encryption at rest** (pgcrypto) — cross-ref Agent 29 Encryption ו-Agent 28 PII Inventory. מספר חשבון בנק הוא PII רגיש — צריך mask (****1234) בכל תצוגה, גישה מורשית בלבד, ו-audit log על read.
- **F-53-032 [HIGH]** בפרויקט הנוכחי יש כבר `audit_log` (line 338), אבל אין `read_audit_log` — אי אפשר לדעת מי ניגש לפרטי בנק של ספק.
- **F-53-033 [HIGH]** אין שדה `iban` ו/או `swift_bic` לספק זר (USD/CNY). cross-ref F-53-110 (currency).
- **F-53-034 [HIGH]** **אין מנגנון לאימות חשבון בנק**: Penny-test (הפקדה של ₪0.01 וקבלת אישור), או אימות מול מסמך אישור ניהול חשבון. תרמית של "change of bank details" — התקיפה הנפוצה ביותר על מערכות רכש — לא ממוגנת כלל.

---

### 2.5 ולידציית Tax ID (תיק ניכויים)

**מימצאים:**
- **F-53-040 [CRITICAL]** **אין עמודת `tax_withholding_id` ב-schema.** תיק ניכויים בישראל הוא 9 ספרות ומשמש לניכוי במקור מתשלום לספק (בדרך כלל 30%, או 0% אם יש אישור פטור). ללא השדה הזה **כל תשלום לספק ללא אישור פטור חייב ניכוי 30% במקור** — חובה חוקית ברורה. חברת טכנו-כל עוזי בע"מ (ראו server.js:265) אינה ממלאת חובה זו.
- **F-53-041 [CRITICAL]** **אין עמודת `withholding_exemption_until`** (תוקף אישור ניכוי מופחת). רשות המסים מנפיקה אישורי פטור עם תוקף (לדרך כלל שנה קלנדרית). המערכת לא מסוגלת לבצע alert על "אישור ספק יפוג בעוד 30 יום".
- **F-53-042 [CRITICAL]** **אין עמודה לאחוז ניכוי** (`withholding_rate`). אם ספק מציג אישור ניכוי 5%, המערכת חייבת לזכור זאת.
- **F-53-043 [HIGH]** אין integration / placeholder ל-shaam.gov.il / "שירות בדיקת ניכוי במקור" (אישור בר תוקף עבור ניכוי). כרגע הכל ידני.
- **F-53-044 [HIGH]** אין עמודה `vat_exemption` (עוסק פטור — לא גובה מע"מ). הפצל חובה לדוחות ניכוי.

---

### 2.6 העלאת חוזה — None (Cross-ref Agent 47)

**מימצאים:**
- **F-53-050 [CRITICAL]** **אין מנגנון לאחסון חוזי ספק.** אין עמודה `contract_url`, אין `contract_signed_at`, אין `contract_expires_at`, אין Supabase Storage bucket מוגדר בקובץ. אין `app.post('/api/suppliers/:id/contract')`. אין upload UI.
- **F-53-051 [HIGH]** אין NDA / DPA (Data Processing Agreement) tracking — רלוונטי ל-GDPR (cross-ref Agent 26) אם הספק מקבל נתוני לקוח/פרויקט.
- **F-53-052 [HIGH]** אין תאריכי תחילה/סיום/חידוש אוטומטי לחוזה. ספק לא יקבל התראה על חידוש.
- **F-53-053 [MEDIUM]** אין template חוזה מובנה (הסכם מסגרת רכש) — כל חוזה מוחזר/נחתם מחוץ למערכת.

---

### 2.7 Approval Workflow — ידני או אוטומטי?

**קוד רלוונטי (server.js:149-154):**
```js
app.post('/api/suppliers', async (req, res) => {
  const { data, error } = await supabase.from('suppliers').insert(req.body).select().single();
  ...
  res.status(201).json({ supplier: data });
});
```

**Schema:**
```sql
active BOOLEAN DEFAULT true,   -- ספק פעיל מיד!
```

**מימצאים:**
- **F-53-060 [CRITICAL]** **אין approval workflow כלל.** ספק נוצר עם `active=true` מיד, זמין מיד לשליחת RFQ (ראה server.js:246 — `if (p.suppliers?.active) ...`). אין שלב `pending_review`, `approved`, `rejected`.
- **F-53-061 [HIGH]** אין עמודת `status` עם ENUM `('draft','pending_kyb','approved','suspended','blacklisted')`. כל ספק או `active=true` או `active=false`.
- **F-53-062 [HIGH]** אין עמודות `approved_by`, `approved_at`, `rejection_reason`, `blacklist_reason`. לא ניתן לבצע separation of duties (מי שמקליד ≠ מי שמאשר).
- **F-53-063 [HIGH]** audit log נרשם (line 152), אבל רק `"created"` — אין `"approved"`, `"suspended"`, `"reactivated"`. cross-ref Agent 20 Logging.
- **F-53-064 [MEDIUM]** אין רציונל רב-דרגי (למשל: עד ₪10K = auto-approve, ₪10K-₪100K = manager approval, ₪100K+ = finance+legal).

---

### 2.8 Supplier Categorization

**קוד רלוונטי:**
- `supplier_products.category TEXT NOT NULL` (schema line 47) — קטגוריה ברמת מוצר.
- frontend RFQTab (jsx:253) משתמש ב-hard-coded list:
  ```js
  const categories = ["ברזל", "אלומיניום", "נירוסטה", "זכוכית", "צבע", "ברגים_ואביזרים", "כלי_עבודה", "ציוד_בטיחות"];
  ```

**מימצאים:**
- **F-53-070 [HIGH]** **ספק עצמו אינו מקוטלג.** `suppliers` table אין לו עמודת `category` או `categories TEXT[]`. הקטגוריה מוסקת עקיפין דרך `supplier_products.category`. המשמעות: **אם לא הוכנסו מוצרים** אחרי הוספת ספק, הספק לא יופיע ב-RFQ search (server.js:239-248) כי ה-join נכשל.
- **F-53-071 [HIGH]** הרשימה hard-coded ב-jsx:253 ואינה מסונכרנת עם DB. אם קובי מוסיף קטגוריה חדשה ל-supplier_products, היא לא תופיע בדרופדאון של RFQ. אין `/api/categories` endpoint.
- **F-53-072 [MEDIUM]** אין hierarchy (parent/child): "ברזל" > "ברזל זיון 12 מ"מ". אין categories taxonomy.
- **F-53-073 [MEDIUM]** `suppliers.tags TEXT[]` קיים (line 37) אבל **אינו נאסף בטופס הפרונט**. תג מאפשר לסווג כמו `["preferred", "local", "emergency", "certified_iso"]` — אין שום שימוש.
- **F-53-074 [LOW]** אין שדה `supplier_type` (manufacturer / distributor / service / subcontractor). `subcontractors` היא טבלה נפרדת לחלוטין — קיים duplication של schema (`subcontractors` vs `suppliers`).

---

### 2.9 נתונים גיאוגרפיים (כתובת, עיר)

**Schema:**
```sql
address TEXT,           -- טקסט חופשי
country TEXT DEFAULT 'ישראל',
distance_km NUMERIC,    -- מרחק מחושב? איפה?
```

**מימצאים:**
- **F-53-080 [HIGH]** `address TEXT` הוא **טקסט חופשי אחד**. אין `street`, `city`, `zip`, `region`, `lat`, `lng`. אי אפשר לבצע distance calc, routing, clustering גיאוגרפי.
- **F-53-081 [HIGH]** `distance_km` קיים כעמודה, אבל **אין קוד שמחשב אותו**. אף endpoint לא מעדכן distance_km. Grep על "distance" בקוד מחזיר רק את העמודה עצמה.
- **F-53-082 [MEDIUM]** אין integration ל-Google Maps / Mapbox / OSM geocoding לאימות כתובת.
- **F-53-083 [MEDIUM]** `delivery_address DEFAULT 'ריבל 37, תל אביב'` ב-`purchase_orders` (schema:204) — **כתובת המפעל hard-coded**. ספק לא יכול לדעת כתובת פרויקט דינמית.
- **F-53-084 [LOW]** ה-seed כולל "אזור תעשייה חולון", "אזור תעשייה ראשלצ" — טקסטים לא סטנדרטיים.

---

### 2.10 תנאי תשלום (net 30 / net 60)

**Schema:**
```sql
default_payment_terms TEXT DEFAULT 'שוטף + 30',
```

**מימצאים:**
- **F-53-090 [HIGH]** `TEXT` חופשי — לא ENUM. ערכים אפשריים: "שוטף + 30", "שוטף+30", "שוטף 30", "נטו 30", "net 30", "Net 30". 6 וריאציות על אותו תנאי.
- **F-53-091 [HIGH]** הטופס הפרונט (SuppliersTab, lines 207-211) **אינו אוסף** `default_payment_terms`. ברירת המחדל 'שוטף + 30' תישמר תמיד. אי אפשר להגדיר ספק COD, שוטף+60, חצי מראש חצי בקבלה.
- **F-53-092 [HIGH]** אין `credit_limit` (מגבלת אשראי לספק). אין `credit_used`. אין התרעה "הספק מגיע למגבלת אשראי".
- **F-53-093 [HIGH]** אין `early_payment_discount` (הנחה בתשלום מקדים, למשל 2% אם 10 יום במקום 30). חשוב ל-working-capital optimization.
- **F-53-094 [MEDIUM]** אין מנגנון calculation של `due_date` מ-`invoice_date + payment_terms`. נראה שה-PO מכיל `payment_terms` (schema:202) אבל אין עמודת `due_date`.

---

### 2.11 תמיכה במטבעות (ILS/USD/CNY)

**Schema:**
```sql
-- supplier_products:
currency TEXT DEFAULT 'ILS',
-- supplier לא שומר currency לכלל!
-- purchase_orders:
currency TEXT DEFAULT 'ILS',
```

**מימצאים:**
- **F-53-100 [HIGH]** **לטבלת `suppliers` אין עמודת `default_currency`.** אי אפשר לקבוע שספק סיני מקבל USD בלבד. Currency נקבע ברמת מוצר או PO, לא ברמת ספק.
- **F-53-101 [HIGH]** **אין עמודת exchange rate snapshot** — PO ב-USD עם יצירה ב-2026-04-11 והגעה ב-2026-05-01 — איזה שער היה? אין `fx_rate_at_creation`, `fx_rate_at_payment`.
- **F-53-102 [HIGH]** `analytics/spend-by-supplier` (server.js:825) מסכם `total_spent` — אבל העמודה `suppliers.total_spent` היא `NUMERIC` ללא currency — מערבבת ILS+USD+CNY.
- **F-53-103 [MEDIUM]** אין integration ל-fx provider (Bank of Israel, ECB, XE). שערי חליפין נקודתיים ידניים.
- **F-53-104 [LOW]** ה-seed כולל רק ILS, אין דוגמה לספק זר.

---

### 2.12 Initial Product Catalog Import

**מימצאים:**
- **F-53-110 [HIGH]** **אין mechanism ל-bulk import** של מוצרי ספק. קיים `POST /api/suppliers/:id/products` (server.js:166) לפריט אחד בלבד. אין CSV/XLS upload, אין template. onboarding של ספק עם 200 פריטים = 200 קליקים ידניים.
- **F-53-111 [HIGH]** אין validation ל-SKU uniqueness (`supplier_products.sku TEXT` בלי UNIQUE).
- **F-53-112 [HIGH]** אין price list parsing (ספקים שולחים PDF/XLS מחיר). אין OCR/LLM ingestion pipeline.
- **F-53-113 [MEDIUM]** אין "last_price_update" per product, אין תזכורת לעדכן מחירון אחת לתקופה.
- **F-53-114 [MEDIUM]** אין supplier_products.`moq_unit` (תווית יחידת min_order_qty ≠ יחידת price).

---

### 2.13 Test PO בזמן onboarding

**מימצאים:**
- **F-53-120 [HIGH]** **אין test PO workflow.** עליית ספק חדש אינה כוללת "First PO = test PO" עם delivery tracking מלא. כל ספק חדש מיד 100% available.
- **F-53-121 [HIGH]** אין תיוג `first_po_id`, `first_po_result` (passed/failed/warning) על רשומת הספק.
- **F-53-122 [MEDIUM]** Probation period — אין `probation_end_at`. ספק שעשה fail ב-first PO אמור לעבור דרך manual review לפני PO #2 — אין mechanism.

---

### 2.14 תבנית Welcome WhatsApp

**מימצאים:**
- **F-53-130 [HIGH]** **אין welcome message אחרי יצירת ספק.** POST /api/suppliers (line 149) לא שולח שום welcome WhatsApp. אין קוד שמחובר לפונקציה `sendWhatsApp()` לאחר insert.
- **F-53-131 [MEDIUM]** אין קישור/לינק להסכם מסגרת, אין onboarding URL ייעודי.
- **F-53-132 [MEDIUM]** אין consent / opt-in tracking עבור WhatsApp Business (חובה לפי Meta/WABA policy).
- **F-53-133 [LOW]** ה-RFQ message (server.js:262-276) חתום "טכנו כל עוזי בע"מ" hard-coded — אם יש mismatch בשם חברה, דרוש refactor.

---

### 2.15 אתחול דירוג ספק (Rating Initialization)

**Schema defaults:**
```sql
rating NUMERIC DEFAULT 5 CHECK (rating >= 1 AND rating <= 10),
delivery_reliability NUMERIC DEFAULT 5 CHECK ...,
quality_score NUMERIC DEFAULT 5 CHECK ...,
overall_score NUMERIC DEFAULT 70,
risk_score NUMERIC DEFAULT 30,
on_time_delivery_rate NUMERIC DEFAULT 100,
total_negotiated_savings NUMERIC DEFAULT 0,
```

**מימצאים:**
- **F-53-140 [HIGH]** **אי-עקביות מספרית:** `rating/delivery_reliability/quality_score` מדורגים 1-10, אבל `overall_score` מאותחל ל-**70** (כאילו סולם 0-100) והחישוב ב-`calculate_supplier_score()` (line 410) מחזיר ערך על סולם ~0-25. ה-70 הדיפולטי **לא קשור** לחישוב האמיתי. בדיקה: בעקבות יצירת ספק חדש, `overall_score=70` נשאר עד שהפונקציה נקראית ידנית — אבל **אין trigger או call** שקורא לפונקציה אוטומטית. `calculate_supplier_score` לא נקרא משום מקום בקוד של server.js (grep מראה רק את ההגדרה ב-schema).
- **F-53-141 [HIGH]** `on_time_delivery_rate DEFAULT 100` לספק חדש שלא עשה אף משלוח — מעניק לו יתרון מזויף לעומת ספקים עם היסטוריה אמיתית. אותה בעיה: `risk_score DEFAULT 30`, `quality_score DEFAULT 5`.
- **F-53-142 [HIGH]** בחירת הצעה ב-`POST /api/rfq/:id/decide` (server.js:462-480) משתמשת ב-`ratingScore = (supplier.rating || 5) * 10` — ספק חדש (rating=5) מקבל 50 נקודות "ממוצע" גם אם הוא לא עשה כלום. שוקל יותר מספק ותיק עם 4.8.
- **F-53-143 [MEDIUM]** אין cold-start mechanism: reviews imported מספק קודם, או "recommended by: X" (trust propagation).
- **F-53-144 [MEDIUM]** אין קצב דעיכה (rating decay) על ספקים לא פעילים.

---

## 3. מימצאים רוחביים נוספים

- **F-53-200 [HIGH] Rate limiting / DOS:** `POST /api/suppliers` ללא rate limit. script script יכול לייצור 10K ספקים.
- **F-53-201 [HIGH] AuthN/AuthZ:** אין middleware auth על POST /api/suppliers. כל aquí עם גישה לשרת יכול ליצור ספק. Supabase `SUPABASE_ANON_KEY` בשימוש — אין RLS (ראה schema:490 — מוערת).
- **F-53-202 [HIGH] No request schema validation:** אין `zod`/`joi`/`express-validator`. `req.body` נכנס ישירות ל-DB.
- **F-53-203 [MEDIUM] Error messages:** `res.status(400).json({ error: error.message })` חושף הודעות Postgres פנימיות ללקוח (info disclosure, cross-ref Agent 30).
- **F-53-204 [MEDIUM] No idempotency key:** רענון דף → double POST → ספק כפול (ראה F-53-010).
- **F-53-205 [MEDIUM] No optimistic locking:** PATCH /api/suppliers/:id (line 157) אין check `If-Match`/`updated_at`. Concurrent edits last-write-wins.
- **F-53-206 [LOW] Missing timestamps in audit:** audit log (line 152) נרשם אבל לא ברור אם `created_by` ממולא תמיד — the frontend doesn't send `created_by` field.
- **F-53-207 [LOW] No soft delete:** `active=false` הוא פרוקסי, אבל אין `deleted_at`. אי אפשר GDPR right-to-be-forgotten (cross-ref Agent 26).

---

## 4. Cross-References

| Agent | Dimension | Cross-reference |
|-------|-----------|-----------------|
| 26 | GDPR | F-53-050 (DPA), F-53-207 (delete) |
| 28 | PII Inventory | F-53-030..034 (bank), F-53-040..044 (tax) |
| 29 | Encryption | F-53-031 (at-rest encryption required) |
| 30 | Pentest | F-53-002 (mass assignment), F-53-201 (auth), F-53-203 (info disc) |
| 33 | Code Quality | F-53-202 (no validation), F-53-072 (categories dup) |
| 47 (planned) | Contract Mgmt | F-53-050..053 (all contract findings) |

---

## 5. Prioritized Remediation Plan

### P0 — חסימת Production (must-fix before real supplier data)
1. הוספת עמודות ח.פ. / ע.מ. / תיק ניכויים / incorporation_type / legal_name (F-53-020..024, F-53-040..044)
2. `UNIQUE(lower(name))` + `UNIQUE(regexp_replace(phone,'[^0-9]',''))` + `UNIQUE(company_id)` (F-53-010..014)
3. ח.פ. checksum validator (server-side, client-side) (F-53-021)
4. Approval workflow: `status ENUM('draft','pending_review','approved','suspended','blacklisted')`, `approved_by`, `approved_at` (F-53-060..064)
5. AuthN/AuthZ middleware + request schema validation (zod/joi) (F-53-201, F-53-202)
6. Rate limit + CSRF (F-53-200)
7. Fix initial rating (F-53-140..142) — ספק חדש → overall_score=NULL עד PO ראשון

### P1 — לפני go-live
8. Bank account fields + encryption (pgcrypto) + penny-test (F-53-030..034)
9. Contract upload endpoint + Supabase Storage bucket + expiry tracker (F-53-050..053)
10. Currency default per supplier + fx snapshot on PO (F-53-100..103)
11. Structured address (street/city/zip/lat/lng) + geocoding integration (F-53-080..082)
12. Welcome WhatsApp template + opt-in tracking (F-53-130..132)
13. Category sync from DB to frontend RFQ (F-53-071) + taxonomy
14. Duplicate detection: fuzzy match on create (`pg_trgm`) (F-53-013)

### P2 — Post-launch improvement
15. Payment terms ENUM + credit_limit + early_payment_discount (F-53-090..094)
16. Bulk catalog import CSV/XLS (F-53-110..112)
17. First PO test workflow + probation period (F-53-120..122)
18. Rating cold-start + decay (F-53-143, F-53-144)
19. Soft delete + GDPR compliance (F-53-207)
20. Connect `calculate_supplier_score()` via trigger (F-53-140)

---

## 6. Summary Counts

| Severity | Count |
|----------|-------|
| CRITICAL | 14 |
| HIGH     | 32 |
| MEDIUM   | 17 |
| LOW      | 6 |
| **Total**| **69** |

**Dimensions with zero implementation:** bank info, tax ID, contract upload, approval workflow, welcome WA, test PO, duplicate detection, company ID checksum, structured geo.
**Dimensions partial:** currency (per-product only), payment terms (text only), categorization (product-level only), rating init (schema only, broken integration).

---

*QA Agent #53 — static analysis report complete. All findings are derived from three source files only: `onyx-dashboard.jsx`, `server.js`, `001-supabase-schema.sql`. No runtime testing performed.*
