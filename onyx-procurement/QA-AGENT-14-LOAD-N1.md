# QA Agent 14 — ניתוח עומסים ושאילתות N+1 (ONYX Procurement)

**תאריך:** 2026-04-11
**סוג ניתוח:** Static analysis בלבד (ללא הרצה)
**קבצים שנבדקו:**
- `onyx-procurement/server.js` (934 שורות)
- `onyx-procurement/supabase/migrations/001-supabase-schema.sql` (562 שורות)
- `onyx-procurement/web/onyx-dashboard.jsx` (710 שורות)

**הקשר עסקי:** מסגריית מתכת של קובי — כ-10-50 הזמנות רכש בחודש, משתמש יחיד או 2-3 משתמשים מקבילים. הדרישה: המערכת חייבת לטפל בעומס גדול פי 10 ללא שום מאמץ.

---

## 1. סיכום מנהלים (TL;DR)

| קטגוריה | מספר בעיות | חומרה מקסימלית |
|---|---|---|
| N+1 Queries (לולאות עם DB) | 3 | בינוני |
| חסר Batch Insert | 3 | בינוני |
| חסר Index | 4 | נמוך-בינוני |
| Views במקום Materialized Views | 3 | נמוך (היום), גבוה (בעתיד) |
| חסר Pagination | 3 | נמוך (היום), גבוה (בעתיד) |
| Audit Log ללא גיזום | 1 | נמוך (היום), גבוה (בעתיד) |
| HTTP חיצוני סדרתי (WhatsApp) | 1 | בינוני-גבוה |
| חסר שכבת Caching | 1 | נמוך (היום), בינוני (בעתיד) |
| סה"כ ממצאים | **19** | |

**שורה תחתונה:** בקנה מידה של קובי היום (10-50 הזמנות/חודש, משתמש יחיד) — המערכת **תעבוד בסדר גמור**. אף אחת מהבעיות אינה urgent עכשיו. אבל **3 בעיות עלולות להתפוצץ בעתיד** (שנה+ של שימוש): audit_log bloat, חוסר pagination בהזמנות רכש, ו-WhatsApp rate limits בשליחת RFQ.

---

## 2. טבלת ממצאים מפורטת

| חומרה | מיקום | בעיה | השפעה עכשיו (10-50/חודש) | השפעה פי 10 (500/חודש) | תיקון |
|---|---|---|---|---|---|
| **בינוני** | `server.js:289-321` — `/api/rfq/send` | **N+1 Query בלולאת ספקים.** לכל ספק: `rfq_recipients.insert()` + `sendWhatsApp()` serialized. עבור 13 ספקים = 13 inserts רצופים + 13 קריאות HTTP רצופות. סה"כ זמן: ~5-15 שניות. | ⚠️ לא urgent. 1 RFQ בשבוע, UX סביר. אבל הלקוח ממתין 10 שניות. | 🔴 בעיה. 500 RFQ/חודש → שליחות איטיות, timeout של Express. | שימוש ב-`Promise.all()` עם `Promise.allSettled` + **batch insert** של כל ה-`rfq_recipients` ברצף אחד. ראה תיקון מלא בהמשך. |
| **בינוני** | `server.js:402-410` — `/api/quotes` | **N+1 Query בלולאת price_history.** לכל פריט בהצעה: `price_history.insert()` נפרד. הצעה עם 10 פריטים = 10 inserts. | ✅ לא urgent. הצעה טיפוסית 3-5 פריטים, כמה שניות. | ⚠️ 500 הצעות × 10 פריטים = 5,000 inserts/חודש ב-trips נפרדים. איטי. | `supabase.from('price_history').insert(lineItems.map(...))` — batch יחיד. תיקון של 3 שורות. |
| **בינוני** | `server.js:541-556` — `/api/rfq/:id/decide` | `po_line_items.insert()` כבר בטח (batch). **טוב.** אבל המבנה סביב זה (`suppliers.update` ב-L576) לא עושה שימוש ב-`returning`. | ✅ לא רלוונטי. | ✅ לא רלוונטי. | לא נדרש תיקון. |
| **נמוך** | `server.js:204-207` — `/api/purchase-requests` | כבר משתמש ב-batch insert (`itemsWithRequestId`). ✅ תקין. | ✅ תקין. | ✅ תקין. | אין מה לתקן. |
| **גבוה (בעתיד)** | `server.js:600-606` — `/api/purchase-orders` (GET) | **חסר pagination.** `SELECT * FROM purchase_orders ORDER BY created_at` מחזיר **את הכל** ללא `LIMIT`. נטען ב-dashboard כל 30 שניות. | ✅ לא urgent. 50 הזמנות/חודש × 12 = 600 הזמנות. JSON ~200KB. סביר. | 🔴 **קריטי.** 500/חודש × 36 חודש = 18,000 הזמנות. JSON ~6MB כל 30 שניות. Supabase bandwidth quota. UI קופא. | הוסף `.range(offset, offset+49)` ו-`.order('created_at')`. ה-frontend צריך לקרוא רק את דף 1. סנן לפי `status != 'closed'` ב-dashboard. |
| **גבוה (בעתיד)** | `server.js:213-218` — `/api/purchase-requests` (GET) | אותה בעיה: מחזיר את כל ה-requests + items בלי pagination. | ✅ לא urgent. | 🔴 זהה לעיל. | `.limit(100)` + pagination. |
| **בינוני (בעתיד)** | `server.js:852-856` — `/api/audit` | `audit` יש `limit` (default 50) ✅. **אבל** ה-`audit_log` עצמו **לא נגזם לעולם.** כל פעולה כותבת שורה. 10 פעולות/יום × 365 = 3,650 שורות/שנה. כפול 10 שנים = 36,500 שורות. | ✅ לא urgent. | ⚠️ בעתיד: 500 פעולות/יום × 5 שנים × 10 משתמשים = ~9M שורות. INSERT עדיין מהיר (יש `idx_audit_created`), אבל backup ו-storage יגדלו. | הוסף Supabase scheduled job לגיזום: `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '2 years'`. או העבר ל-archive table. |
| **נמוך** | `server.js:99-105` — helper `audit()` | כל API call מבצע עוד insert ל-`audit_log` **סנכרוני** (`await`). זה הופך כל endpoint להיות double-write. | ✅ לא urgent. | ⚠️ בעומסים גבוהים - latency מצטבר. | השמט `await` — "fire and forget": `audit(...).catch(console.error)`. הלקוח לא צריך לחכות על auditing. |
| **בינוני** | `schema.sql` — index על `suppliers.active` | **חסר index על `active`.** מופיע ב-WHERE בדשבורד (`procurement_dashboard:486`) ובסינון ספקים (`server.js:182, 246`). כרגע 5 ספקים, אבל כל query עושה sequential scan. | ✅ לא urgent. | ⚠️ 500 ספקים → scan מלא. שנים 3. | `CREATE INDEX idx_suppliers_active ON suppliers(active) WHERE active = true;` — partial index. |
| **נמוך** | `schema.sql` — index על `purchase_orders.status` | ✅ **קיים כבר** (`idx_po_status` בשורה 232). | ✅ תקין. | ✅ תקין. | אין מה לתקן. |
| **בינוני** | `schema.sql` — index על `rfqs.status` | **חסר index.** ה-view `procurement_dashboard` בודק `WHERE status IN ('sent', 'collecting')` (שורה 484). ב-`/api/rfqs` יש `ORDER BY sent_at`. | ✅ לא urgent, כמה RFQs ברגע נתון. | ⚠️ שימושים רבים + sequential scan. | `CREATE INDEX idx_rfqs_status ON rfqs(status); CREATE INDEX idx_rfqs_sent_at ON rfqs(sent_at DESC);` |
| **נמוך** | `schema.sql` — index על `purchase_requests.status` | **חסר index.** | ✅ לא urgent. | ⚠️ שנים 3+. | `CREATE INDEX idx_pr_status ON purchase_requests(status);` |
| **נמוך** | `schema.sql` — index על `audit_log(entity_type, entity_id)` | ✅ **קיים כבר** (`idx_audit_entity`, שורה 350). | ✅ תקין. | ✅ תקין. | אין מה לתקן. |
| **גבוה (בעתיד)** | `schema.sql:433-488` — Views `rfq_summary`, `supplier_dashboard`, `procurement_dashboard` | **Regular views (לא materialized).** בכל קריאה ל-`/api/status`, `/api/suppliers`, `/api/rfqs` — ה-DB **מריץ מחדש** את כל ה-GROUP BY והצירופים. `procurement_dashboard` לבדה מכילה **9 sub-queries**. בדשבורד שמרענן כל 30s, זה 2 req/s של ריצות כבדות. | ✅ לא urgent. בסקייל נוכחי הווים מהירים (<50ms). | 🔴 **קריטי.** עם 18K הזמנות + 5K RFQs + 100 ספקים, `procurement_dashboard` יכול להגיע ל-2-5 שניות. כל משתמש על dashboard = עומס מתמשך. | החלף ל-**Materialized Views** + `REFRESH MATERIALIZED VIEW CONCURRENTLY procurement_dashboard;` כל דקה כ-cron job. או הוסף שכבת caching (ראה #16). |
| **בינוני** | `server.js:289-296` — `sendWhatsApp` בלולאה | **HTTP חיצוני סדרתי.** WhatsApp Business API **יש לו rate limit** (~80 הודעות/שנייה ברמת Tier 1, פחות אם חדש). 13 ספקים רצופים ב-`for` לוקח ~10 שניות (רשת + עיבוד השרת מרחוק). | ⚠️ כל RFQ = 10 שניות המתנה של ה-UI. חוויה גרועה אבל עובד. | 🔴 100+ ספקים → timeout, או rate-limit block מ-Meta. | השתמש ב-`Promise.allSettled(suppliers.map(s => sendWhatsApp(...)))` + **job queue** (Bull/BullMQ) לשליחה אסינכרונית ברקע. ה-HTTP response צריך להחזיר `rfq_id` מיד. |
| **בינוני (בעתיד)** | `server.js:329-333` — `system_events.insert` | אירוע מערכת נכתב **באותו request של ה-RFQ**, גם הוא `await`. עוד trip לדאטהבייס. | ✅ לא urgent. | ⚠️ overhead מצטבר. | `fire-and-forget` (בלי await). |
| **נמוך** | `onyx-dashboard.jsx:45` — `setInterval(refresh, 30000)` | דשבורד מרענן את **6 endpoints** כל 30 שניות. ב-1 משתמש = 12 req/minute = 0.2 req/s. ב-10 משתמשים = 2 req/s. | ✅ לא urgent. 2 req/s קלים, כל אחד יפגע ב-views הכבדים (ראה #14). | ⚠️ מרכיב מאולץ — views לא materialized + 10 משתמשים × 6 קריאות × 2/דקה = 120 req/min על ה-DB כל הזמן. בעתיד יהיה כבד. | 1) הוסף `stale-while-revalidate` ב-frontend (React Query). 2) הוסף cache ב-Express (memory/Redis) ל-5s על ה-dashboard endpoints. 3) הגדל את interval ל-60s (קובי הוא משתמש יחיד). |
| **בינוני (בעתיד)** | `server.js` (כללי) — **חסר שכבת Caching** | **כל** קריאה ל-Supabase עוברת ברשת ישירות ל-DB. אין זיכרון ביניים. `suppliers` list לא משתנה ברוב הזמן, אבל נטען כל 30s. | ✅ לא urgent. | ⚠️ משני את `/api/suppliers`, `/api/status`, `/api/analytics/savings` עם TTL של 30-60 שניות, תחסוך 80% מה-load. | הוסף `node-cache` או `memory-cache`: <br>`const cache = new NodeCache({ stdTTL: 30 });`<br>`if (cache.has('suppliers')) return cache.get('suppliers');` — 5 שורות ל-hot path. |
| **נמוך** | `server.js:141-145` — `/api/suppliers/:id` | 3 queries עוקבות ב-`await` רצוף (supplier, products, priceHistory). אפשר `Promise.all`. | ✅ לא urgent. 3 פניות מהירות. | ⚠️ 3 roundtrips במקום 1. | `const [{data:s},{data:p},{data:h}] = await Promise.all([...])` — חיסכון ~100ms. |
| **נמוך** | `server.js:438-453` — `/api/rfq/:id/decide` | 2 queries עוקבות `supplier_quotes` ואז `suppliers`. אפשר לקבל הכל ב-join אחד: `supplier_quotes(*, quote_line_items(*), suppliers(*))`. | ✅ לא urgent. | ⚠️ 2 roundtrips במקום 1. | שימוש ב-FK join של Supabase: `.select('*, quote_line_items(*), suppliers(*)')`. |
| **נמוך** | `server.js:143` — `/api/suppliers/:id` | `.limit(50)` ב-priceHistory. אבל **רק** כאן. בשאר ה-endpoints אין limit בכלל. | ✅ תקין אצל ספק יחיד. | ✅ תקין. | אין מה לתקן. |
| **נמוך** | `server.js:150-153` — `POST /api/suppliers` | insert + audit (2 queries). `await audit` מוסיף ~50ms. | ✅ לא urgent. | ✅ לא urgent. | fire-and-forget audit. |
| **אזהרה** | `schema.sql` — חסר index על `price_history(recorded_at)` | ה-`/api/suppliers/:id` עושה `ORDER BY recorded_at DESC LIMIT 50`. בלי index — sort של כל הטבלה. | ✅ לא urgent. שנה אחת ~600 רשומות. | ⚠️ 10 שנים × 1000 ספקים = 500K רשומות. sort יקר. | `CREATE INDEX idx_price_history_recorded ON price_history(recorded_at DESC);` |
| **אזהרה** | `server.js:110-122` — `/api/status` | `procurement_dashboard.select('*').single()` — הכי כבד ב-DB, נטען ב-status. | ✅ תקין בסקייל של היום. | 🔴 קריטי אם 10 משתמשים מרעננים dashboard. | Materialized view + cache. |

---

## 3. תיקון מומלץ לבעיה #1 (N+1 ב-RFQ send)

**קוד נוכחי** (server.js:289-321):
```js
// 5. Send to all suppliers
const results = [];
for (const supplier of suppliers) {
  // ... send WhatsApp (serial)
  await supabase.from('rfq_recipients').insert({...});
  results.push({...});
}
```

**תיקון מומלץ:**
```js
// 5a. Send to all suppliers in parallel (non-blocking)
const sendResults = await Promise.allSettled(
  suppliers.map(async (supplier) => {
    const channel = supplier.preferred_channel || 'whatsapp';
    const address = channel === 'whatsapp' ? (supplier.whatsapp || supplier.phone) : supplier.phone;
    try {
      if (channel === 'whatsapp' && WA_TOKEN) {
        return { supplier, channel, address, result: await sendWhatsApp(address, messageText) };
      } else if (channel === 'sms') {
        return { supplier, channel, address, result: await sendSMS(address, messageText) };
      }
      return { supplier, channel, address, result: { success: false } };
    } catch (err) {
      return { supplier, channel, address, result: { success: false, error: err.message } };
    }
  })
);

// 5b. Batch insert all recipients in ONE DB call
const recipientRows = sendResults.map(({ value }) => ({
  rfq_id: rfq.id,
  supplier_id: value.supplier.id,
  supplier_name: value.supplier.name,
  sent_via: value.channel,
  delivered: value.result.success,
  status: value.result.success ? 'delivered' : 'sent',
}));
await supabase.from('rfq_recipients').insert(recipientRows);

const results = sendResults.map(({ value }) => ({
  supplier: value.supplier.name,
  channel: value.channel,
  address: value.address,
  delivered: value.result.success,
  messageId: value.result.messageId,
}));
```

**תועלת:** 13 ספקים — מ-~10 שניות ל-~1.5 שניות (86% שיפור).

---

## 4. תיקון מומלץ לבעיה #2 (N+1 ב-price_history)

**קוד נוכחי** (server.js:402-410):
```js
for (const item of lineItems) {
  await supabase.from('price_history').insert({
    supplier_id: quoteData.supplier_id,
    product_key: item.name,
    price: item.unit_price,
    quantity: item.quantity,
    source: 'quote',
  });
}
```

**תיקון:**
```js
if (lineItems.length) {
  await supabase.from('price_history').insert(
    lineItems.map(item => ({
      supplier_id: quoteData.supplier_id,
      product_key: item.name,
      price: item.unit_price,
      quantity: item.quantity,
      source: 'quote',
    }))
  );
}
```

**תועלת:** הצעה עם 10 פריטים — מ-10 roundtrips ל-1. חיסכון ~500ms.

---

## 5. דילקקס של Indexes שצריך להוסיף

```sql
-- Partial index על ספקים פעילים
CREATE INDEX IF NOT EXISTS idx_suppliers_active
  ON suppliers(active) WHERE active = true;

-- Indexes ל-RFQs
CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_sent_at ON rfqs(sent_at DESC);

-- Index ל-purchase_requests
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);

-- Index ל-price_history
CREATE INDEX IF NOT EXISTS idx_price_history_recorded
  ON price_history(recorded_at DESC);

-- Index ל-purchase_orders created_at (ל-ORDER BY)
CREATE INDEX IF NOT EXISTS idx_po_created_at
  ON purchase_orders(created_at DESC);
```

---

## 6. Materialized Views (לעתיד)

```sql
-- החלף את procurement_dashboard ל-materialized
DROP VIEW IF EXISTS procurement_dashboard;
CREATE MATERIALIZED VIEW procurement_dashboard AS
SELECT
  (SELECT COUNT(*) FROM purchase_orders WHERE status NOT IN ('closed', 'cancelled', 'delivered')) AS active_orders,
  -- ... (אותו תוכן)
;

-- Index עליה
CREATE UNIQUE INDEX ON procurement_dashboard ((1));

-- Refresh job (ב-Supabase: pg_cron extension)
SELECT cron.schedule(
  'refresh_procurement_dashboard',
  '* * * * *', -- כל דקה
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY procurement_dashboard; $$
);
```

---

## 7. סיכום עדיפויות

### דחוף עכשיו (לעשות השבוע):
- **אין.** המערכת תעבוד מצוין בסקייל של קובי.

### רצוי עכשיו (לעשות החודש):
1. ✅ תיקון N+1 ב-`/api/rfq/send` (30 דקות עבודה, משפר UX מיידית)
2. ✅ תיקון N+1 ב-`/api/quotes` price_history (5 דקות)
3. ✅ הוספת 6 האינדקסים למעלה (2 דקות, הרצה ב-Supabase SQL editor)
4. ✅ `Promise.all` ב-`/api/suppliers/:id`
5. ✅ `fire-and-forget` על `audit()` ו-`system_events`

### לעתיד (לפני 500 הזמנות/חודש, תוך שנה):
6. Pagination על `/api/purchase-orders` + `/api/purchase-requests`
7. Job queue (BullMQ) עבור WhatsApp sending
8. Materialized views + pg_cron refresh
9. Cache layer (node-cache/Redis) על endpoints קרים
10. Audit log pruning job

### אופציונלי:
11. Index על `rfqs.status`, `purchase_requests.status`
12. React Query ב-frontend עם `staleTime` במקום setInterval גולמי

---

## 8. מסקנה

המערכת של קובי בנויה נכון ב-**90%**. הלולאות עם DB calls הן סטנדרטיות בקוד JS (כל אחד עושה את זה), ובסקייל הנוכחי הן **לא בעיה בפועל**. אבל יש **5 תיקונים מהירים של 5-30 דקות** שישפרו UX מיידית ויכינו את המערכת לצמיחה עתידית.

**הערכה כללית:** היום — **A-**. אחרי תיקונים — **A+**. ללא תיקונים בעתיד (שנה+) — **C** (ייצטבר latency, bloat).

---

*QA Agent 14 — Load and N+1 Specialist | ONYX Procurement | 2026-04-11*
