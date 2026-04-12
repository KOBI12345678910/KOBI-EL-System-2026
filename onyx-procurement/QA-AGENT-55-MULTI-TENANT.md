# QA Agent 55 — Multi-Tenancy Readiness
## onyx-procurement — ניתוח מוכנות למצב רב-דייריות (Multi-Tenant SaaS)

**תאריך בדיקה:** 2026-04-11
**סוג ניתוח:** Static Analysis בלבד
**ממד בדיקה:** Multi-Tenancy Readiness
**דירוג כללי:** **0/100 — Pure single-tenant, אפס הכנה ל-SaaS**

---

## תקציר מנהלים (TL;DR)

המערכת **חד-דיירית לחלוטין** (hardcoded ל"טכנו כל עוזי בע"מ"). אין עמודת `tenant_id`/`org_id` על אף אחת מ-18 הטבלאות, אין RLS, אין ניהול משתמשים, אין בידוד שום שכבה. המעבר ל-SaaS ידרוש שכתוב מסיבי: כל טבלה, כל שאילתה, כל endpoint, וכן הוספת אותנטיקציה, אונבורדינג, חיוב, ותת-דומיינים. ההערכה: **6-9 חודשי פיתוח מלא** + הגירת סכמה מסוכנת.

**אין** שום מנגנון שימנע דליפת מידע בין דיירים ברגע הוספה נאיבית של `tenant_id` — צריך RLS חובה בשכבת ה-DB.

---

## 1. מצב הטבלאות — האם יש tenant_id?

**תוצאה: אין עמודת tenant_id/org_id באף טבלה. אפס. לא אחת.**

ניתוח של 18 טבלאות בקובץ `supabase/migrations/001-supabase-schema.sql`:

| # | טבלה | יש tenant_id? | השפעה |
|---|------|---------------|--------|
| 1 | `suppliers` | ❌ | ספקים גלובליים — כולם רואים את כולם |
| 2 | `supplier_products` | ❌ | קטלוג מוצרים משותף |
| 3 | `price_history` | ❌ | **דליפת מידע מחירים בין שוקי מתחרים** |
| 4 | `purchase_requests` | ❌ | בקשות רכש גלויות לכולם |
| 5 | `purchase_request_items` | ❌ | (FK בלבד ל-`purchase_requests`) |
| 6 | `rfqs` | ❌ | RFQs בכל המערכת גלויים |
| 7 | `rfq_recipients` | ❌ | מי שלח למי — גלוי |
| 8 | `supplier_quotes` | ❌ | **הצעות מחיר — סוד תחרותי חמור** |
| 9 | `quote_line_items` | ❌ | פירוטי הצעות |
| 10 | `purchase_orders` | ❌ | **הזמנות רכש — GDPR + סוד מסחרי** |
| 11 | `po_line_items` | ❌ | פירוט הזמנות |
| 12 | `procurement_decisions` | ❌ | היסטוריית החלטות |
| 13 | `subcontractors` | ❌ | קבלני משנה משותפים |
| 14 | `subcontractor_pricing` | ❌ | **מחירי קבלנים — סודי לחלוטין** |
| 15 | `subcontractor_decisions` | ❌ | החלטות על קבלנים |
| 16 | `audit_log` | ❌ | לוג משותף — אי-אפשר לבודד פעולות |
| 17 | `system_events` | ❌ | אירועים גלובליים |
| 18 | `notifications` | ❌ | התראות בלי נמען ארגוני |

**18/18 טבלאות ללא עמודת בידוד דייר. ציון: 0%.**

### ראיות נוספות בסכמה:
- `purchase_orders.delivery_address` — **hardcoded** ברירת מחדל `'ריבל 37, תל אביב'` (שורה 204) — זוהי כתובת קובי. אין שדה לכתובת ברירת מחדל לכל דייר.
- `suppliers.country` — default `'ישראל'` (שורה 16) — מנחה שזה חד-מדינתי.
- `supplier_quotes.vat_amount` — לוגיקת 18% hardcoded ב-server.js (שורה 377) — מע"מ משתנה בין תחומי שיפוט.
- נתוני seed ("מתכת מקס", "סטיל פרו" וכו') חיים ישירות בטבלה הגלובלית — בלי הפרדה בין "seed לדוגמה" ל"נתונים של דייר".

---

## 2. עלות הגירת `tenant_id` רטרואקטיבית

### הוצאות טכניות:
1. **הוספת עמודה לכל טבלה** (×18):
   ```sql
   ALTER TABLE suppliers ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<KOBI_TENANT>';
   ```
   חייב NOT NULL — אבל רשומות קיימות ידרשו ערך ברירת מחדל. צריך לאכלס רטרואקטיבית.

2. **עדכון כל המפתחות הזרים** — ה-FKs הקיימים חוצי-דיירים פוטנציאלית. לדוגמה, `supplier_products.supplier_id` לא מאמת שה-supplier באותו דייר.

3. **עדכון 18 אינדקסים קיימים + יצירת אינדקסים מורכבים חדשים**:
   ```sql
   CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
   CREATE INDEX idx_po_tenant_status ON purchase_orders(tenant_id, status);
   CREATE INDEX idx_quotes_tenant_rfq ON supplier_quotes(tenant_id, rfq_id);
   ```

4. **שכתוב כל 3 ה-views**: `rfq_summary`, `supplier_dashboard`, `procurement_dashboard` — כל אחד מבצע JOIN/aggregation ללא tenant filter. הם יחשפו נתונים חוצי-דיירים.

5. **עדכון הפונקציה** `calculate_supplier_score(p_supplier_id UUID)` — היא מבצעת `UPDATE suppliers SET overall_score = ...` ללא תחימה ל-tenant. אין הגנה מפני חישוב ציונים חוצי-דיירים.

6. **שכתוב `server.js` — ~935 שורות**:
   - **35+ שאילתות Supabase** ב-`server.js` — כל אחת ללא `.eq('tenant_id', ...)`.
   - `supabase` נוצר פעם אחת ב-client גלובלי (שורה 23-26) עם `SUPABASE_ANON_KEY` — לא עם JWT שמכיל את הדייר.
   - אין middleware שמשייך request לדייר. אין `req.tenantId`.
   - בקשות POST מקבלות גוף שלם מהלקוח — כלומר לקוח זדוני יכול לשלוח `{ tenant_id: "other_tenant" }` ולכתוב לדייר אחר בלי בדיקה.

### הערכת שעות (realistic):
- סכמת DB + מיגרציה: **~40 שעות**
- שכתוב server.js (35 endpoints + middleware): **~80 שעות**
- בדיקות רגרסיה + QA מבודד-דייר: **~60 שעות**
- UI changes (לא נסקרה UI כרגע): **~40 שעות**
- **סה"כ מינימום: 220 שעות ≈ 5-6 שבועות של דב רציני** — *בלי* אונבורדינג/חיוב/ניהול משתמשים.

---

## 3. RLS (Row-Level Security) — בשימוש?

**תוצאה: לא. מובא כהערה בלבד.**

בסוף הסכמה (שורות 490-493):
```sql
-- ═══ RLS (Row Level Security) — אם רוצים הרשאות ═══
-- ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for authenticated" ON suppliers FOR ALL USING (auth.role() = 'authenticated');
```

**כל השורות מוסתרות כהערות. RLS לא מופעל על אף טבלה.**

ה"מדיניות" המוצעת (`auth.role() = 'authenticated'`) אפילו כשתופעל — **לא תגן בין דיירים**, כי היא רק מבדילה בין "אנונימי" ל"מחובר". כל משתמש מחובר יראה הכל.

### RLS נדרש:
לאחר הוספת `tenant_id`, יש לכתוב מדיניות מסוג:
```sql
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_suppliers ON suppliers
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

יש לחזור על זה עבור כל 18 הטבלאות. בנוסף:
- להחליף `SUPABASE_ANON_KEY` ב-`SUPABASE_SERVICE_ROLE_KEY` → **סכנת bypass** אם משתמשים בו בלי care. המומלץ: לכל משתמש JWT עם claim של `tenant_id`.
- server.js **ישבור** ברגע שיופעל RLS כי הקליינט הגלובלי אנונימי לא יראה כלום.

---

## 4. אסטרטגיית בידוד דיירים — מה מתאים?

### שלוש אופציות:
1. **Shared DB, Shared Schema + RLS** (המומלצת):
   - *יתרונות*: זול, פשוט יחסית, עובד טוב עם Supabase.
   - *חסרונות*: bug אחד ב-RLS = דליפה מלאה. כל שינוי סכמה משפיע על כולם.
   - *התאמה*: ✅ הטובה ביותר לסטארטאפ עם 10-1000 דיירים.

2. **Shared DB, Schema-per-Tenant**:
   - *יתרונות*: בידוד חזק יותר, migration-per-tenant ייתכן.
   - *חסרונות*: Supabase לא תומך טוב ב-schema per tenant. מסובך ל-SQL queries חוצי-טבלה.
   - *התאמה*: ❌ לא מתאים.

3. **Database-per-Tenant**:
   - *יתרונות*: בידוד מוחלט, RPO/RTO per tenant.
   - *חסרונות*: יקר. ניהול 100 מסדים = סיוט. overhead גדול.
   - *התאמה*: רק ל-enterprise tier.

### המלצה:
**Shared DB + RLS** עם:
- `auth.jwt()` יחזיק `tenant_id` כ-claim.
- כל טבלה עם RLS enforced.
- בדיקות אוטומטיות: `SELECT from suppliers AS tenant_A` → מוודאים שאין זליגה מ-tenant_B.

---

## 5. Seed data משותף vs קטלוג פר-דייר

**הבעיה:** שורות 497-527 ב-schema מוסיפות 5 ספקים ו-12 מוצרים *לטבלה הגלובלית*. כלומר:
- זה seed של *קובי* — לא seed לדוגמה.
- כל דייר חדש יירש את הספקים של קובי? זו דליפת נתוני ספקים אמיתית.
- או שהוא יקבל DB ריק בלי seed? אז איפה נתוני התחלה?

**הפתרון הנכון:**
- להפריד `global_catalog` (מוצרים כלליים לדוגמה, כמות סטנדרטית) מ-`tenant_suppliers` (הקטלוג של הדייר).
- אונבורדינג של דייר חדש → UI לבחור אם לייבא `global_catalog` או להתחיל ריק.
- ספקים ציבוריים בישראל אפשר לשתף כ-"קטלוג יעדי ייבוא" אבל תמחור חייב להיות פרטי פר-דייר.

---

## 6. Pricing per tenant (Subscription tiers)

**אין כלל.** אין בסכמה:
- טבלת `subscriptions`/`plans`/`billing`.
- אין Stripe/Paddle/Tranzila integration.
- אין שדה `plan_tier` על איש.
- אין הגבלות שימוש (כגון "מקסימום 100 RFQs בחודש").
- אין מעקב שימוש (usage metering).

**נדרש עבור SaaS:**
```
tenants(id, name, plan_id, status, trial_ends_at, ...)
plans(id, name, price_monthly, max_rfqs, max_suppliers, max_users, features)
subscriptions(tenant_id, plan_id, stripe_sub_id, current_period_end)
usage_events(tenant_id, event_type, quantity, recorded_at)
invoices(tenant_id, amount, status, stripe_invoice_id)
```

**הצעה למבנה tiers** (לבדיקה עסקית):
| Tier | מחיר חודשי | RFQs/חודש | ספקים | משתמשים | תמיכה |
|------|-----------|-----------|-------|---------|-------|
| Starter | ₪299 | 50 | 30 | 2 | Email |
| Pro | ₪899 | 300 | 200 | 10 | WhatsApp |
| Business | ₪2,490 | ∞ | ∞ | 50 | דחוף 24/7 |
| Enterprise | מיוחד | ∞ | ∞ | ∞ | SLA |

---

## 7. Tenant admin role

**אין מערכת הרשאות בכלל.** בקוד:
- כל endpoint פתוח ללא אותנטיקציה. אין `requireAuth`, אין `requireAdmin`, אין JWT check.
- `app.use(cors())` עם default — *CORS פתוח מכל origin*.
- `req.body.created_by || 'api'` (שורה 152) — מי שולח קובע מי יצר. **סכנת spoofing**.

**נדרש:**
- Supabase Auth (`@supabase/auth-js`) או JWT משלך.
- RBAC: `owner`, `admin`, `procurement_manager`, `viewer`.
- `tenant_users(user_id, tenant_id, role)` טבלה.
- Middleware `authenticateTenant(req, res, next)` שמחלץ tenant מה-JWT ומחבר ל-req.

---

## 8. Tenant onboarding UX

**אין כלל.** אין route של `/signup`, `/onboarding`, `/configure`. אין אפילו UI (לא נמצא ב-server.js).

**נדרש flow:**
1. `/signup` → יצירת חשבון (email, password, שם חברה, ח.פ., ת.ד. למע"מ)
2. יצירת tenant + שיוך user ראשון כ-`owner`
3. Wizard 5 צעדים:
   - פרטי חברה + כתובת משלוח ברירת מחדל
   - העלאת לוגו
   - הוספת ספקים (ידנית או ייבוא CSV)
   - הגדרת משקלות החלטה (מחיר/אספקה/דירוג)
   - הזמנת משתמשים נוספים
4. 14-day trial + הכנסת כרטיס אשראי
5. Email verification + Welcome email

---

## 9. Custom branding per tenant

**אפס.** בקוד:
- שורה 265: `חברת טכנו כל עוזי בע"מ` **hardcoded בלב** פונקציית `/api/rfq/send`.
- שורה 657: `טכנו כל עוזי בע"מ` **hardcoded שוב** בפונקציית `/api/purchase-orders/:id/send`.
- שורה 275: בברכה, `טכנו כל עוזי בע"מ`.
- אין טבלת `tenant_branding(tenant_id, logo_url, primary_color, pdf_header, email_signature)`.

**תיקון:**
- שדות branding בטבלת `tenants`.
- החלפת כל שלב של string interpolation ב-`${tenant.company_name}`.
- טעינת CSS variables דינמית לפי primary color.
- תבניות PDF/WhatsApp templates פר-דייר.

---

## 10. Subdomain routing

**לא קיים.** server.js מאזין ל-`PORT 3100` יחיד. אין middleware שמזהה דייר לפי:
- `kobi.onyx.app` (subdomain)
- `onyx.app/kobi` (path prefix)
- Custom domain (`procurement.technocool.co.il`)

### אפשרויות:
1. **Subdomain-based** (מומלץ לצורך branding):
   ```js
   app.use((req, res, next) => {
     const subdomain = req.hostname.split('.')[0];
     req.tenantSlug = subdomain;
     next();
   });
   ```
   דורש wildcard DNS (`*.onyx.app`) + wildcard SSL (Let's Encrypt).

2. **Path-based** (קל יותר לפיתוח):
   `/t/kobi/api/suppliers` — מוסיף prefix לכל route. יוצר UX מכוער יותר.

3. **JWT-based bidding** (הכי פשוט, בלי דומיין):
   מזהה tenant מ-JWT claim. הדומיין לא משנה.

### דרישות נלוות:
- **CORS** יקרוס עם wildcard subdomains — צריך להחליף `cors()` ב-`cors({ origin: (origin, cb) => cb(null, true) })` או whitelist דינמית.
- **SSL**: Let's Encrypt wildcard (DNS-01 challenge).

---

## 11. סיכון דליפת מידע חוצת-דיירים (Cross-Tenant Leak Risk)

**זהו הבאג הכי נפוץ ב-multi-tenant, והמערכת הנוכחית בהגדרה **חשופה ב-100%** לו.**

### מקומות כשל צפויים לאחר הוספה נאיבית של `tenant_id`:
1. **`/api/suppliers/:id`** (שורה 140):
   ```js
   await supabase.from('suppliers').select('*').eq('id', req.params.id).single();
   ```
   בלי `.eq('tenant_id', req.tenantId)` — יחזיר ספק של דייר אחר אם `id` נודע.

2. **`/api/rfq/:id`** (שורה 347) — אותו דבר. מי שיש לו UUID של RFQ של דייר אחר יראה הצעות מחיר שלו.

3. **`/api/purchase-orders/:id`** (שורה 608) — **דליפת PO** (סוד מסחרי + GDPR).

4. **JOINs ללא tenant**:
   ```js
   .from('supplier_products').select('*, suppliers(*)').eq('category', ...)
   ```
   (שורה 173) — JOIN חוצה דיירים אם לא תחום.

5. **Views**:
   - `supplier_dashboard`, `procurement_dashboard`, `rfq_summary` — **אין tenant scope ב-aggregations**. ה-procurement dashboard במיוחד עושה `SELECT COUNT(*) FROM purchase_orders` גלובלי. לאחר הוספת `tenant_id` זה יצטרך WHERE clause אחרת נקבל COUNT של כל הדיירים.

6. **Audit log** — actor ללא tenant. `audit('supplier', data.id, 'created', 'api', ...)` — אם actor-id מדייר A מוצג לדייר B, זו דליפה.

7. **`audit('procurement_decision', decision.id, 'decided', ..., שם ספק מ-supplierMap)`** — שמות ספקים נכתבים ללוג ללא בידוד.

### אסטרטגיית ריסון:
- **RLS חובה בשכבת DB** (defense in depth). אפילו אם ה-app שוכח WHERE, ה-DB יחסום.
- **Integration tests** שיוצרים 2 דיירים, מנסים לגשת לנתונים של השני, ומצפים ל-403.
- **SQL linter** שחוסם שאילתות ללא `tenant_id`.
- **Row counters** — אחרי כל query לוודא שכל התוצאות שייכות לדייר הנוכחי (assertion).

---

## 12. Tenant deletion & GDPR

**אין מנגנון.** אין מסלול `/tenants/:id/delete`, אין job למחיקה מעוכבת.

### דרישות GDPR (Right to Erasure):
1. **Soft delete** (`tenants.deleted_at`) + 30 ימי retention.
2. **Hard delete** אחרי grace period:
   - מחיקת כל הרשומות ב-18 הטבלאות לפי `tenant_id`.
   - מחיקת קבצי PDF/תמונות מ-Supabase Storage.
   - מחיקת user records מ-Supabase Auth.
3. **Data export** לפני מחיקה — CSV/JSON של כל הנתונים של הדייר.
4. **Audit של המחיקה** (meta-log שנשמר מעבר ל-30 ימים).

### בעיה טכנית נוכחית:
`audit_log` ו-`price_history` ו-`procurement_decisions` — אלה נתונים היסטוריים בעלי ערך ארגוני. אחרי מחיקת tenant הם הופכים ליתומים (dangling FKs). דרוש CASCADE DELETE בכל `REFERENCES` פלוס "anonymization" לרשומות שנותרות.

**בנוסף:** `suppliers`, `subcontractors` — הספקים של הדייר מכילים *פרטים אישיים של אנשי קשר* (שורה 11: `contact_person`, שורה 12: `phone`, 13: `email`). GDPR דורש יכולת למחוק *אלה* ספציפית, לא רק את הדייר.

---

## 13. Per-tenant rate limits

**אין rate limiting בכלל.** אין `express-rate-limit`, אין `@upstash/ratelimit`, אין middleware.

**סיכון:**
- דייר יחיד יכול לגרום DDoS לכל המערכת.
- WhatsApp API (שורה 36): אם דייר שולח 1000 RFQs בדקה, החשבון של המפעיל (kobi) ייחסם על ידי Meta.
- Supabase יש free-tier limit של 500 req/sec — דייר רע ישרוף את זה בשתי שניות.

**נדרש:**
```js
const rateLimit = require('express-rate-limit');
app.use('/api/rfq/send', rateLimit({
  windowMs: 60 * 1000,
  max: (req) => {
    if (req.tenant.plan === 'starter') return 5;
    if (req.tenant.plan === 'pro') return 30;
    return 100;
  },
  keyGenerator: (req) => req.tenantId, // per tenant
}));
```

**Per-resource limits:**
- `max_suppliers` per tenant (tier-based)
- `max_rfqs_per_month`
- `max_whatsapp_messages_per_day`

---

## 14. Per-tenant analytics dashboards

**ה-views הנוכחיים הם גלובליים:**
- `procurement_dashboard` (שורה 478) — כל הפעולות של כל הדיירים מצטברות. אחרי multi-tenancy זה דורש הפיכה ל-function שמקבלת `tenant_id`:
  ```sql
  CREATE FUNCTION get_procurement_dashboard(p_tenant_id UUID) RETURNS TABLE (...) AS $$
    SELECT COUNT(*) FROM purchase_orders WHERE tenant_id = p_tenant_id AND ...
  $$;
  ```
- `supplier_dashboard` — אותו דבר.
- `rfq_summary` — אותו דבר.

**אנליטיקה גלובלית של המפעיל (Platform Owner):**
- `admin_dashboard` — לקובי כפלטפורמה-אונר: כמה דיירים פעילים, ARR, churn, usage לפי tier.
- זה endpoint נפרד עם הרשאת `platform_admin`, לא `tenant_admin`.

---

## 15. SLA differentiation by tier

**אין כלל SLA מוגדר בקוד.** אין:
- Queue system (Redis/BullMQ) עם priority by tier.
- Response time tracking per tenant.
- Uptime commitments per tier.

### תכנון אפשרי:
| Tier | Uptime | Response | RTO | RPO | תמיכה |
|------|--------|----------|-----|-----|-------|
| Starter | 99.0% | Best effort | 24h | 24h | Email 72h |
| Pro | 99.5% | <500ms p95 | 4h | 1h | WhatsApp 24h |
| Business | 99.9% | <200ms p95 | 1h | 15min | דחוף 4h |
| Enterprise | 99.99% | <100ms p95 | 15min | 5min | 24/7/365 |

### יישום טכני:
- Queue priorities: Enterprise requests → high queue. Starter → low queue.
- Circuit breakers: בעומס, מגבילים את ה-Starter tenants.
- Dedicated Supabase projects לדיירי Enterprise (expensive but clean).

---

## סיכום: 15 ממדי ניתוח

| # | ממד | סטטוס | ציון |
|---|-----|-------|------|
| 1 | עמודת tenant_id על טבלאות | ❌ נעדר מ-18/18 | 0/10 |
| 2 | עלות מיגרציה רטרואקטיבית | 🔴 גבוהה (~220 שעות) | N/A |
| 3 | RLS בשימוש | ❌ בהערות בלבד | 0/10 |
| 4 | אסטרטגיית בידוד | ❌ לא מוגדרת | 0/10 |
| 5 | Seed משותף/פרטי | 🔴 מעורבב | 0/10 |
| 6 | Pricing/tiers | ❌ אין | 0/10 |
| 7 | Tenant admin role | ❌ אין auth בכלל | 0/10 |
| 8 | Onboarding UX | ❌ אין | 0/10 |
| 9 | Custom branding | ❌ hardcoded | 0/10 |
| 10 | Subdomain routing | ❌ אין | 0/10 |
| 11 | Cross-tenant leak risk | 🔴 קיצוני | 0/10 |
| 12 | Tenant deletion/GDPR | ❌ אין | 0/10 |
| 13 | Per-tenant rate limits | ❌ אין rate limiting בכלל | 0/10 |
| 14 | Per-tenant analytics | ❌ כל ה-views גלובליים | 0/10 |
| 15 | SLA by tier | ❌ אין | 0/10 |

**סך הכול: 0/140 — pure single-tenant.**

---

## המלצות אסטרטגיות (לפי סדר עדיפות)

### שלב 0 — החלטה עסקית (לפני פיתוח):
1. **האם באמת להפוך ל-SaaS?** המערכת עובדת מצוין כחד-דיירית לקובי. תוספת ב-SaaS = 6-9 חודשי פיתוח, stripe, תמיכה טכנית, SLA, חוקי פרטיות. מוצדק רק אם יש **10+ לקוחות potential** משלמים.
2. **מודל עסקי:** $/חודש per tenant, per user, or per transaction? ROI?

### שלב 1 — תשתית Multi-tenant (אם הוחלט כן):
1. **Migration plan:**
   - יצירת `tenants` table עם `KOBI_TENANT_ID` ראשון.
   - `ALTER TABLE ... ADD COLUMN tenant_id UUID NOT NULL DEFAULT '<KOBI>'` לכל 18 טבלאות.
   - יצירת FKs חדשים (`tenant_id` REFERENCES `tenants(id)`).
   - Backfill + enforcement (`SET NOT NULL` אחרי backfill).
2. **RLS** לכל 18 טבלאות — מדיניות לפי `auth.jwt() ->> 'tenant_id'`.
3. **Middleware `tenantMiddleware`** ב-server.js שמחלץ מ-JWT ומצמיד ל-`req.tenantId`.
4. **Supabase client לכל request** עם JWT הצרכן, לא anon key גלובלי.

### שלב 2 — Auth + Users:
1. Supabase Auth integration.
2. `tenant_users` table עם RBAC.
3. Invite flow.
4. Password reset, MFA.

### שלב 3 — Billing + Onboarding:
1. Stripe או Tranzila.
2. Subscription lifecycle.
3. Onboarding wizard.
4. Trial logic.

### שלב 4 — Multi-tenant polish:
1. Branding per tenant.
2. Subdomain/custom domain.
3. Per-tenant analytics.
4. SLA + rate limiting.
5. GDPR deletion flow.

---

## דיוקים מסוכנים — Red Flags

1. **שורה 23-26 (server.js):** יצירת Supabase client עם `anon_key` גלובלי. במצב multi-tenant זה מסוכן — כל בקשה תנוע בלי הקשר דייר. לא ניתן להשתמש ב-RLS כראוי.

2. **שורה 204 (schema.sql):** `delivery_address TEXT DEFAULT 'ריבל 37, תל אביב'` — כתובתו הפרטית של קובי חיה בסכמת ה-DB. אם לקוח אחר ישכח לציין כתובת, ההזמנה תישלח לקובי.

3. **שורות 265, 275, 657 (server.js):** `"חברת טכנו כל עוזי בע"מ"` hardcoded בשלושה מקומות. גם RFQs, גם PO, גם הברכה. החלפה קריטית.

4. **שורה 377 (server.js):** VAT 18% hardcoded. מע"מ בישראל היה 17% עד 01/01/2025, ונהפך ל-18%. בעתיד ישתנה שוב. למרות זאת — שדה `vat_rate` לא קיים בטבלה, כלומר multi-country support = 0.

5. **שורה 142 (server.js):** `SELECT * FROM suppliers WHERE id = :id` — אין WHERE עם tenant_id. UUID enumeration attack אפשרי ברגע שהופכים למולטי-דייר.

6. **שורה 338 (audit_log):** `actor TEXT` — סטרינג חופשי. לא מזוהה לדייר או user UUID. אי אפשר לבדוק "מי עשה מה" כשמדובר במספר דיירים.

7. **Views (שורות 433-488):** כולם `CREATE VIEW` ללא תחימה. אחרי הוספת `tenant_id` צריך להפוך ל-`FUNCTION` או `MATERIALIZED VIEW` per-tenant.

---

## שקלול סיכון SaaS

| סיכון | הסתברות | השפעה | עדיפות |
|-------|---------|-------|--------|
| דליפת מחירי ספקים בין דיירי מתחרים | גבוהה מאוד | קיצונית (תביעה) | P0 |
| דליפת רשימות לקוחות/ספקים | גבוהה מאוד | קיצונית | P0 |
| חיוב שגוי עקב חוסר usage tracking | בינונית | גבוהה | P1 |
| GDPR fine (צפי €20M או 4% מההכנסות) | נמוכה (אם אין לקוחות EU) | קיצונית | P1 |
| DDoS מדייר רע אחד על החשבון של כולם | בינונית-גבוהה | גבוהה | P1 |
| Migration bug משאיר רשומות ללא tenant_id | בינונית | גבוהה מאוד | P0 |
| `delivery_address` ברירת מחדל שולח הזמנות לקובי | גבוהה | בינונית-גבוהה | P0 |

---

## כמה מילים לסיום

המערכת כרגע היא **single-tenant בכל המובנים** — זה לא רע; זה פשוט מה שהיא. החלטה על SaaS היא החלטה עסקית, לא טכנית. אם ההחלטה חיובית, התהליך הנכון הוא:

1. לבנות **תשתית multi-tenant חדשה לגמרי**, לא לתקן את הקיימת.
2. להעביר את הדאטה של קובי לדייר הראשון (`KOBI_TENANT`).
3. להשאיר את המערכת הנוכחית פועלת עד שה-SaaS יציבה.
4. ליצור **שכבת API חדשה** עם `tenant_id` מהיום הראשון — לא כ-afterthought.

ניסיון להפוך את המערכת הנוכחית ל-SaaS "בזבוב" = סיכון מוחלט לדליפה + חודשי debug.

---
*QA Agent #55 — Multi-Tenancy Readiness Analysis*
*onyx-procurement project | 2026-04-11*
