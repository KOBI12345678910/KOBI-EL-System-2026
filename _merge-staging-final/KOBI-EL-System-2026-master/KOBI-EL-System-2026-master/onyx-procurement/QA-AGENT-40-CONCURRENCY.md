# QA Agent #40 — Concurrency & Race Conditions
## דו"ח ניתוח סטטי — onyx-procurement

**מימד:** Concurrency & Race Conditions
**היקף:** `server.js` + `supabase/migrations/001-supabase-schema.sql`
**תאריך:** 2026-04-11
**סטטוס:** Static Analysis Only

---

## ממצאי חומרה — סיכום מנהלים

| # | ממצא | חומרה | מיקום |
|---|------|-------|-------|
| C-01 | אישור כפול של PO — אין אידמפוטנטיות ב-approve | **קריטי** | server.js:614-623 |
| C-02 | RFQ.decide — דואליות/ריצה כפולה יוצרת שתי PO + שתי decisions | **קריטי** | server.js:425-593 |
| C-03 | Read-Modify-Write ללא optimistic lock על supplier stats | **גבוה** | server.js:576-580 |
| C-04 | אין SELECT FOR UPDATE באף מקום — אין נעילה פסימית | **גבוה** | global |
| C-05 | אין Supabase RPC טרנזקציוני — כל פעולה היא REST nonatomic | **גבוה** | global |
| C-06 | Partial failure ב-RFQ send loop — אין פיצוי/rollback | **גבוה** | server.js:288-321 |
| C-07 | Webhook WhatsApp ללא dedup על msg.id → כפילות אירועים | **גבוה** | server.js:876-901 |
| C-08 | audit() ללא await ב-shutdown path + fire-and-forget | **בינוני** | server.js:99-105 |
| C-09 | אין Idempotency-Key headers באף POST endpoint | **גבוה** | global |
| C-10 | Connection pooling מ-Supabase client יחיד — ללא limiter | **בינוני** | server.js:22-26 |
| C-11 | sendWhatsApp בלולאה sequential על-פני N ספקים — blocks event loop ארוך | **בינוני** | server.js:288-321 |
| C-12 | total_spent/total_orders מתעדכן מתוך מטמון JS של supplierMap — lost updates | **קריטי** | server.js:576-580 |

**סה"כ:** 12 ממצאים (4 קריטיים, 6 גבוהים, 2 בינוניים)

---

## C-01 — אישור כפול של Purchase Order (POST /api/purchase-orders/:id/approve)

**חומרה:** קריטי
**מיקום:** `server.js:614-623`

```js
app.post('/api/purchase-orders/:id/approve', async (req, res) => {
  const { data } = await supabase.from('purchase_orders').update({
    status: 'approved',
    approved_by: req.body.approved_by,
    approved_at: new Date().toISOString(),
  }).eq('id', req.params.id).select().single();

  await audit('purchase_order', data.id, 'approved', req.body.approved_by, `PO approved: ₪${data.total}`);
  res.json({ order: data, message: '✅ הזמנה אושרה' });
});
```

**בעיות:**
1. אין בדיקה של `status` הנוכחי — אם ה-PO כבר מאושר, הקריאה תעדכן שוב ותכתוב `approved_at` חדש + approved_by חדש. זה מוחק הצגת מאשר המקורי.
2. אין `.eq('status', 'pending_approval')` או `.eq('status', 'draft')` כ-guard — כלומר אם שני משתמשים שולחים approve בו-זמנית, שני ה-UPDATE מצליחים ושתיהן קוראות לאותה פעולה audit פעמיים.
3. אין idempotency key → ניסיונות חוזרים (retry של client, double-click) מייצרים רשומות audit כפולות.
4. השדה `approved_by` עלול להישכב מתוך `req.body` ללא validation — משתמש יכול לאשר PO שלא שלו.

**תסריט race:**
- בקשה A ובקשה B מגיעות יחד (שניהם `PUT status='approved'`).
- PostgreSQL מריץ UPDATE אחרי UPDATE; אף אחד לא נתפס במדיניות כלשהי.
- שתי audit רשומות נוצרות; האחרון "מנצח" את `approved_at`.

**המלצה:**
```js
// Guard ב-WHERE clause + החזרת rowsAffected
.update({ status: 'approved', ... })
.eq('id', req.params.id)
.in('status', ['draft', 'pending_approval'])  // רק אם עדיין לא אושר
// אם no rows returned → 409 Conflict
```

---

## C-02 — RFQ.decide — ריצה כפולה יוצרת PO כפול + decision כפול

**חומרה:** קריטי
**מיקום:** `server.js:425-593`

**בעיה:**
`POST /api/rfq/:id/decide` הוא הזרם הכי מסוכן. אין בדיקה ש-`rfqs.status !== 'decided'` לפני היצירה של:
1. `purchase_orders` חדש (INSERT)
2. `po_line_items` (INSERT)
3. `procurement_decisions` חדש (INSERT)
4. `rfqs UPDATE status='decided'`
5. `suppliers UPDATE total_orders+1, total_spent+X`

**תסריט race:**
- שתי קריאות במקביל (client1, client2) עם אותו rfqId.
- שתיהן קוראות `SELECT supplier_quotes` — שתיהן רואות את אותן הצעות.
- שתיהן בוחרות את אותו winner.
- שתיהן יוצרות PO (שני purchase_orders שונים עם אותו rfq_id!).
- שתיהן יוצרות procurement_decisions.
- שתיהן מגדילות `total_orders` ב-1 (אבל רק אחת זוכה כי Read-Modify-Write מבוסס cache — ראה C-12).
- שתיהן שולחות UPDATE rfq → status='decided'.

**תוצאה:** שני PO "תקפים" לאותו RFQ, שני decisions, stats מושחתים, אחד מהם יישלח אוטומטית לספק.

**המלצה:**
1. `purchase_orders.rfq_id` → להוסיף `UNIQUE constraint` (או partial unique `WHERE status != 'cancelled'`).
2. לעדכן `rfqs SET status='decided' WHERE id=X AND status != 'decided'` לפני שאר הפעולות; אם 0 rows → 409 Conflict.
3. להשתמש ב-Supabase RPC (PL/pgSQL function) שמבצע הכל בתוך transaction יחידה.

---

## C-03 & C-12 — Read-Modify-Write של supplier stats (Lost Updates)

**חומרה:** קריטי
**מיקום:** `server.js:576-580`

```js
// Update supplier stats
await supabase.from('suppliers').update({
  total_orders: (supplierMap.get(winner.supplier_id)?.total_orders || 0) + 1,
  total_spent: (supplierMap.get(winner.supplier_id)?.total_spent || 0) + winner.total_price,
  last_order_date: new Date().toISOString(),
}).eq('id', winner.supplier_id);
```

**בעיות קריטיות:**
1. `supplierMap` הוא snapshot מ-JS שנטען בתחילת ה-endpoint. אם בזמן העיבוד ספק זה קיבל PO אחר (מ-endpoint מקביל), הערך שלנו *old*.
2. אין `.eq('updated_at', originalUpdatedAt)` — אין optimistic locking. כל מה שמתעדכן במקביל → lost update.
3. השאילתה היא JS arithmetic ולא SQL atomic increment (`total_orders = total_orders + 1`).

**תסריט lost update:**
- T0: supplier.total_orders = 10
- T1: Decision A קוראת → 10
- T2: Decision B קוראת → 10
- T3: A מעדכן → 11
- T4: B מעדכן → 11 (צריך היה להיות 12)
- **תוצאה:** אחד מה-orders "נאבד" מהסטטיסטיקה.

**המלצה:**
להגדיר Supabase RPC:
```sql
CREATE FUNCTION increment_supplier_stats(p_id UUID, p_amount NUMERIC)
RETURNS VOID AS $$
  UPDATE suppliers
  SET total_orders = total_orders + 1,
      total_spent = total_spent + p_amount,
      last_order_date = NOW()
  WHERE id = p_id;
$$ LANGUAGE SQL;
```
ולקרוא: `supabase.rpc('increment_supplier_stats', {...})`.

---

## C-04 — אין SELECT FOR UPDATE / נעילה פסימית

**חומרה:** גבוה
**מיקום:** כל השרת

אין שימוש ב-`FOR UPDATE`, `FOR SHARE`, advisory locks, או pg_advisory_xact_lock בשום מקום.
Supabase REST API אגב לא מאפשר FOR UPDATE ישיר — רק דרך RPC function ב-PL/pgSQL.

**תוצאה:** כל קריאה שעושה SELECT-modify-UPDATE או SELECT+INSERT פתוחה ל-race condition.

**המלצה:** כל endpoint שמוסיף PO או decision חייב לרוץ כ-RPC atomic ב-DB.

---

## C-05 — אין טרנזקציות אטומיות ב-Supabase REST

**חומרה:** גבוה
**מיקום:** כל ה-INSERT batching

דוגמאות של פעולות נפרדות ללא טרנזקציה:
- `server.js:192-211` — `purchase_requests` INSERT ואז `purchase_request_items` INSERT בנפרד. אם השני נכשל, יש request ללא items.
- `server.js:279-321` — `rfqs` INSERT, לאחר מכן לולאה על `rfq_recipients` INSERT + WhatsApp send. אם השרת נהרג באמצע, יהיה RFQ ב-DB עם קיבוץ חלקי של recipients.
- `server.js:381-410` — `supplier_quotes` INSERT, אח"כ `quote_line_items` INSERT, אח"כ `rfq_recipients UPDATE`, אח"כ לולאה של `price_history` INSERT. כל כישלון → state חצוי.
- `server.js:524-580` — יצירת PO + line items + decision + supplier stats + RFQ status — 5 טבלאות נפרדות ללא rollback.

**המלצה:** להעביר ל-PL/pgSQL RPC עם BEGIN/COMMIT.

---

## C-06 — Partial failure ב-RFQ send loop

**חומרה:** גבוה
**מיקום:** `server.js:288-321`

```js
for (const supplier of suppliers) {
  // ... sendWhatsApp ...
  await supabase.from('rfq_recipients').insert({ ... delivered: sendResult.success, ... });
  results.push(...);
}
```

**בעיות:**
1. אם הלולאה נהרגת באמצע (OOM, timeout), חלק מהספקים קיבלו WhatsApp וחלק לא — וחלק מה-recipients ב-DB וחלק לא.
2. אין rollback — המערכת תחשוב ש-10 מתוך 30 ספקים התקבלו כ-"delivered" אם 20 לא עברו את הלולאה.
3. לולאה sequential → ספק 30 מחכה 29×latency.
4. אין retry על כישלון WhatsApp.
5. WhatsApp API rate-limit (80/sec) לא נבדק — כמה ספקים = ban.
6. אם הצרכן מרענן (retry) → כל הספקים שכבר קיבלו מקבלים הודעה שנייה (**double message**). ראה גם C-09.

---

## C-07 — Webhook WhatsApp ללא dedup על message ID

**חומרה:** גבוה
**מיקום:** `server.js:876-901`

```js
app.post('/webhook/whatsapp', async (req, res) => {
  // ...
  if (messages?.length) {
    for (const msg of messages) {
      // ...
      await supabase.from('system_events').insert({ ... data: { ... messageId: msg.id ... } });
    }
  }
  res.sendStatus(200);
});
```

**בעיה:**
Meta/WhatsApp Business API שולח webhook retries אוטומטיים אם השרת החזיר status != 200 או לא החזיר תוך N שניות. בכל retry ה-`msg.id` זהה, אבל אין כאן בדיקה שמפיקה dedup.

**תוצאה:** אותה הודעת WhatsApp יכולה להיכנס כ-system_event 3-5 פעמים.

**חמור יותר:** אם בעתיד הלוגיקה תפרש הודעות נכנסות כהצעות-מחיר (parsing quotes from replies), אותה הצעה תיכנס כפולה לטבלת `supplier_quotes` ותשפיע על החלטות AI.

**המלצה:** להוסיף constraint `UNIQUE (data->>'messageId')` או לחפש לפני insert: `SELECT ... WHERE data->>'messageId' = msg.id`.

---

## C-08 — audit() fire-and-forget בלי await במקרים של שגיאה

**חומרה:** בינוני
**מיקום:** `server.js:99-105`

הפונקציה `audit()` אמנם async אבל לא מטפלת בשגיאות:
```js
async function audit(entityType, entityId, action, actor, detail, prev, next) {
  await supabase.from('audit_log').insert({ ... });
}
```

אם ה-insert נכשל (Supabase down / timeout), השגיאה מופיעה אבל:
1. לא תפוסה ב-try/catch של ה-endpoint.
2. לא מונעת את שליחת התגובה למשתמש.
3. הרישום הקריטי לאמון/רגולציה נאבד שקט.

**race condition עקיף:** אם audit log הוא הבסיס לבדיקת כפילות (לדוגמה "כבר אושר?") — ואין audit — אפשר לאשר פעמיים.

---

## C-09 — אין Idempotency-Key headers באף POST endpoint

**חומרה:** גבוה
**מיקום:** גלובלי

כל ה-POSTs הבאים **חייבים** להיות אידמפוטנטיים אבל אינם:
- `POST /api/purchase-requests` — כפתור כפול → שתי בקשות
- `POST /api/rfq/send` — retry רשת → שתי סיבובי RFQ
- `POST /api/quotes` — עדכון כפול של הצעה
- `POST /api/rfq/:id/decide` — ראה C-02 למעלה
- `POST /api/purchase-orders/:id/approve` — ראה C-01
- `POST /api/purchase-orders/:id/send` — שליחת WhatsApp כפולה לספק
- `POST /api/subcontractors/decide`

**המלצה:** לקבל header `Idempotency-Key`, לשמור request_id→response בטבלת `idempotency_keys` (TTL 24h), ולהחזיר את אותה התגובה אם המפתח קיים.

---

## C-10 — Connection pool & Supabase client יחיד

**חומרה:** בינוני
**מיקום:** `server.js:22-26`

```js
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
```

**תצפיות:**
1. אין הגדרת `db.pooler` או `connection_limit` — משאיר את הערך ברירת-מחדל של PostgREST (~10-20 concurrent).
2. אין rate-limiting על Express (`express-rate-limit` לא נמצא).
3. אין connection pooling מפורש — בקשות concurrent פשוט "נתלות".
4. תחת עומס, endpoint כמו `/api/rfq/send` שעושה ~N queries sequentiala בלולאה יגרום להשחתת ה-pool.

**המלצה:** להוסיף `express-rate-limit` + להשתמש ב-Supabase session pooler (port 6543) עבור endpoints heavy.

---

## C-11 — sendWhatsApp sequential בלולאה ארוכה

**חומרה:** בינוני
**מיקום:** `server.js:288-321`

הלולאה `for (const supplier of suppliers)` מריצה `await sendWhatsApp(...)` sequentially. עבור 30 ספקים, זה יכול להימשך 30×500ms = 15 שניות של block על endpoint יחיד. בזמן זה:
- ה-client מחכה (עלול לעשות timeout → retry → ראה C-09)
- Supabase connection נשמרת פתוחה (בזבוז pool)
- אם יש עוד endpoint מקבילי → connection starvation

**המלצה:**
1. להחזיר 202 Accepted מידית ולהריץ את הלולאה ברקע (job queue).
2. או להשתמש ב-`Promise.allSettled(suppliers.map(...))` עם concurrency limit (לדוגמה `p-limit(5)`).

---

## C-13 — כפילות INSERT ב-price_history בלולאה

**חומרה:** בינוני
**מיקום:** `server.js:402-410`

```js
for (const item of lineItems) {
  await supabase.from('price_history').insert({ ... });
}
```

ב-`POST /api/quotes` לולאה של N inserts בודדים — שוב race אם שתי הצעות זהות מגיעות בו-זמנית. `price_history` אין עליו unique constraint, אז בחומר הזה יהיו רשומות duplicated; זה פחות קריטי אבל יוצר אי-אמון במחיר ממוצע.

**המלצה:** `insert([...])` batch בקריאה אחת.

---

## C-14 — sent_at ב-PO send endpoint

**חומרה:** בינוני
**מיקום:** `server.js:667-670`

```js
await supabase.from('purchase_orders').update({
  status: 'sent',
  sent_at: new Date().toISOString(),
}).eq('id', po.id);
```

אין בדיקה ש-status הוא 'approved'. שני cluster machines (בפריסה) יכולים להריץ את זה יחד → שני WhatsApp, שני updates, אבל רק אחד יישמר.
חמור יותר: endpoint זה שולח WhatsApp **לפני** העדכון ב-DB. אם העדכון נכשל, הספק כבר קיבל את ההזמנה אבל ה-DB עדיין אומר status='approved'. בסיבוב הבא מישהו ינסה לשלוח שוב → duplicate order.

---

## C-15 — decisions בלי lock על RFQ status

**חומרה:** גבוה
**מיקום:** `server.js:573`

```js
await supabase.from('rfqs').update({ status: 'decided' }).eq('id', rfqId);
```

UPDATE זה ללא תנאי `.eq('status', 'collecting')` או דומה. משמע — אם RFQ כבר הוחלט ובוטל, הקריאה תגרור אותו חזרה ל-'decided'.

---

## C-16 — auto_close_on_deadline ללא scheduler

**חומרה:** מידע בלבד
**מיקום:** schema + server.js

בסכמה יש שדה `rfqs.auto_close_on_deadline BOOLEAN DEFAULT true` אבל אין scheduler ב-server.js (אין `node-cron`, אין `bullmq`, אין `setInterval`). זה אומר שאם שני cron workers רצים במקביל ומנסים לסגור RFQ בו-זמנית בעתיד — צפוי race. כרגע אין wrapper, אז זה רק deferred risk.

---

## סיכום סיכונים והמלצות קריטיות

| נושא | פעולה נדרשת |
|-------|---------|
| RFQ.decide + PO.approve | להעביר ל-RPC atomic + guard על status |
| Supplier stats | לעבור ל-SQL atomic increment דרך RPC |
| Idempotency | להוסיף Idempotency-Key middleware |
| Webhook dedup | UNIQUE constraint על messageId ב-system_events |
| Transactions | כל multi-insert → RPC function |
| Rate limiting | express-rate-limit על WhatsApp send endpoints |
| Optimistic locking | להוסיף `.eq('updated_at', original)` לכל UPDATE |

**חומרה כוללת:** **קריטי** — המערכת לא בטוחה לפריסה ב-production עם יותר ממשתמש יחיד בו-זמנית. הצפה של rate-critical endpoints (RFQ send, decide, approve) תגרום ל-data corruption.
